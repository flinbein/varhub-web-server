import { type Hub, Room, TimeoutDestroyController, ApiHelperController } from "@flinbein/varhub";
import createNetworkApi from "@flinbein/varhub-api-network";
import jsonHash from "@flinbein/json-stable-hash"
import { QuickJSController } from "@flinbein/varhub-controller-quickjs";
import { newQuickJSWASMModuleFromVariant, newQuickJSAsyncWASMModuleFromVariant } from "quickjs-emscripten";
import quickJsSyncVariant from "@jitl/quickjs-ng-wasmfile-release-sync"
import quickJsAsyncVariant from "@jitl/quickjs-ng-wasmfile-release-asyncify"
import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify";
import { Logger } from "../Logger.js";


const apiMap = {
	"network": createNetworkApi({
		fetchPoolTimeout: 10_000, // 10s
		fetchPoolCount: 10,
		fetchMaxActiveCount: 5,
		ipBlacklist: [
			"0.0.0.0/8", // Software
			"10.0.0.0/8", // Private network
			"100.64.0.0/10", // Private network
			"127.0.0.0/8", // Host
			"169.254.0.0/16", // Subnet
			"172.16.0.0/12", // Private network
			"192.0.0.0/24", // Private network
			"192.0.2.0/24", // Documentation
			"192.88.99.0/24", // Internet. Formerly used for IPv6 to IPv4 relay
			"192.168.0.0/16", // Private network
			"198.18.0.0/15", // Private network
			"198.51.100.0/24", // Documentation
			"203.0.113.0/24", // Documentation
			"224.0.0.0/4", // Internet. In use for multicast
			"233.252.0.0/24", // Documentation
			"240.0.0.0/4", // Internet. Reserved for future use
			"255.255.255.255/32", // Subnet. Reserved for the "limited broadcast" destination address
		],
		fetchAllowIp: true,
		domainBlacklist: ['localhost', /\.local$/],
		domainWhitelist: [/\./],
		// fetchMaxContentLength:  100 /* 100 kB */ * 1000,
		fetchHeaders: {
			"user-agent": "Mozilla/5.0 (compatible; VARHUB-API/1.0)",
		}
	})
}

const bodySchema = {
	type: 'object',
	properties: {
		integrity: {
			anyOf: [{ type: 'boolean' }, { type: 'string' }],
		},
		module: {
			type: "object",
			properties: {
				main: {type: "string"},
				source: {type: "object", additionalProperties: {type: "string"}},
			},
			required: ["source", "main"],
			additionalProperties: false,
		},
		async: {type: "boolean"},
		logger: {type: "string"},
		config: true,
		message: {type: "string"},
		additionalProperties: false,
	},
	required: ["module"]
} as const;

export const createQuickJSRoom = (varhub: Hub, loggers: Map<string, Logger>): FastifyPluginCallback => async (fastify) => {
	const quickJS = await newQuickJSWASMModuleFromVariant(quickJsSyncVariant as any);
	const quickJSAsync = await newQuickJSAsyncWASMModuleFromVariant(quickJsAsyncVariant as any);
	
	fastify.withTypeProvider<JsonSchemaToTsProvider>().post(
		'/room',
		{schema: {body: bodySchema}},
		async (request, reply) => {
			return reply.redirect(308, "/room/qjs");
		}
	)
	
	fastify.withTypeProvider<JsonSchemaToTsProvider>().post(
		'/room/qjs',
		{schema: {body: bodySchema}},
		async (request, reply) => {
			reply.type("application/json");
			
			const userAgentHeader = request.headers["user-agent"];
			if (userAgentHeader?.includes("VARHUB-API")) {
				return reply.code(403).send({
					type: "forbidden",
					message: `forbidden for user-agent: ${userAgentHeader}`,
				});
			}
			
			const userIntegrity = request.body.integrity;
			const moduleParam = request.body.module;
			const integrity = userIntegrity ? jsonHash(moduleParam, "sha256", "hex") : undefined;
			if (integrity && typeof userIntegrity === "string" && integrity !== userIntegrity)  {
				console.log("userIntegrity", typeof userIntegrity, userIntegrity);
				return reply.code(400).send({
					type: "Integrity",
					message: `integrity check error. Got ${userIntegrity}, but expected ${integrity}!`,
				});
			}
			
			const room = new Room();
			const config = request.body.config ?? undefined;
			const roomId = varhub.addRoom(room, integrity);
			if (typeof request.body.message === "string" ) {
				room.publicMessage = request.body.message;
			}
			
			new TimeoutDestroyController(room, 1000 * 60 * 2 /* 2 min */);
			const apiHelperController = new ApiHelperController(room, apiMap);
			
			const logger = request.body.logger ? loggers.get(request.body.logger) : undefined;
			const quickJsUsed = request.body.async ? quickJSAsync : quickJS;
			const ctrl = new QuickJSController(room, quickJsUsed, moduleParam, {config, apiHelperController});
			if (logger) {
				logger.handleRoom(roomId!, room);
				logger.handleQuickJS(roomId!, ctrl);
			}
			ctrl.on("console", (level, ...args) => {
				console.log("%s",`[Room ${roomId}] ${level}:`, ...args);
			})
			if (request.body.async) await ctrl.startAsync();
			else ctrl.start();
			
			return reply.code(200).send({id: roomId, integrity: integrity ?? null, message: room.publicMessage});
		}
	);
}
