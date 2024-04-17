import { type Hub, Room, TimeoutDestroyController, ApiHelperController } from "@flinbein/varhub";
import createNetworkApi from "@flinbein/varhub-api-network";
import jsonHash from "@flinbein/json-stable-hash"
import { QuickJSController } from "@flinbein/varhub-controller-quickjs";
import { getQuickJS } from "quickjs-emscripten"
import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify";


const apiMap = {
	"network": createNetworkApi({
		fetchPoolTimeout: 10_000, // 10s
		fetchMaxActiveCount: 5,
		fetchPoolCount: 10,
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
		fetchAllowIp: false,
		domainBlacklist: ['localhost', /\.local$/],
		domainWhitelist: [/\./],
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
		config: true,
		message: {type: "string"},
		additionalProperties: false,
	},
	required: ["module"]
} as const;

export const createRoom = (varhub: Hub): FastifyPluginCallback => async (fastify) => {
	const quickJS = await getQuickJS();
	
	fastify.withTypeProvider<JsonSchemaToTsProvider>().post(
		'/room',
		{schema: {body: bodySchema}},
		(request, reply) => {
			reply.type("application/json");
			const userIntegrity = request.body.integrity;
			const moduleParam = request.body.module;
			const integrity = userIntegrity ? jsonHash(moduleParam, "sha256", "hex") : undefined;
			if (integrity && typeof userIntegrity === "string" && integrity !== userIntegrity)  {
				console.log("userIntegrity", typeof userIntegrity, userIntegrity);
				return reply.code(200).send({
					type: "integrity",
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
			const apiHelperController = new ApiHelperController(room, apiMap)
			const ctrl = new QuickJSController(room, quickJS, moduleParam, {config, apiHelperController});
			ctrl.on("console", (level, ...args) => {
				console.log("%s",`[Room ${roomId}] ${level}:`, ...args);
			})
			return reply.code(200).send({id: roomId, integrity: integrity ?? null, message: room.publicMessage});
		}
	);
}