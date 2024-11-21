import { type Hub, Room, TimeoutDestroyController, ApiHelperController, ApiSource } from "@flinbein/varhub";
import jsonHash from "@flinbein/json-stable-hash"
import { QuickJSController } from "@flinbein/varhub-controller-quickjs";
import { newQuickJSWASMModuleFromVariant, newQuickJSAsyncWASMModuleFromVariant } from "quickjs-emscripten";
import quickJsSyncVariant from "@jitl/quickjs-ng-wasmfile-release-sync"
import quickJsAsyncVariant from "@jitl/quickjs-ng-wasmfile-release-asyncify"
import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify";
import { Logger } from "../Logger.js";


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

export const roomQjsPost = (varhub: Hub, apiSource: ApiSource, loggers: Map<string, Logger>): FastifyPluginCallback => async (fastify) => {
	const quickJS = await newQuickJSWASMModuleFromVariant(quickJsSyncVariant as any);
	const quickJSAsync = await newQuickJSAsyncWASMModuleFromVariant(quickJsAsyncVariant as any);
	
	fastify.withTypeProvider<JsonSchemaToTsProvider>().post(
		'/room',
		{schema: {body: bodySchema}},
		async (request, reply) => {
			return reply.redirect( "/room/qjs", 308);
		}
	)
	
	fastify.withTypeProvider<JsonSchemaToTsProvider>().post(
		'/room/qjs',
		{schema: {body: bodySchema}},
		async (request, reply) => {
			reply.type("application/json");
			
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
			if (typeof request.body.message === "string" ) {
				room.publicMessage = request.body.message;
			}
			
			new TimeoutDestroyController(room, 1000 * 60 * 2 /* 2 min */);
			const apiHelperController = new ApiHelperController(room, apiSource);
			
			const logger = request.body.logger ? loggers.get(request.body.logger) : undefined;
			const quickJsUsed = request.body.async ? quickJSAsync : quickJS;
			const ctrl = new QuickJSController(room, quickJsUsed as any, moduleParam, {config, apiHelperController});
			ctrl.on("dispose", () => room.destroy());
			const roomId = varhub.addRoom(room, integrity);
			if (logger) {
				logger.handleRoom(roomId!, room);
				logger.handleQuickJS(roomId!, ctrl);
			}
			if (request.body.async) await ctrl.startAsync();
			else ctrl.start();
			
			return reply.code(200).send({id: roomId, integrity: integrity ?? null, message: room.publicMessage});
		}
	);
}
