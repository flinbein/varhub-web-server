import { ApiHelperController, type Hub, Room, TimeoutDestroyController } from "@flinbein/varhub";
import jsonHash from "@flinbein/json-stable-hash"
import { randomUUID } from "node:crypto";
import { IsolatedVMController } from "@flinbein/varhub-controller-isolated-vm";
import type { JsonSchemaToTsProvider } from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify";
import { Logger } from "../Logger.js";
import apiMap from "../api/index.js";

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
		inspect: {
			anyOf: [{ type: 'boolean' }, { type: 'string' }],
		},
		config: true,
		message: {type: "string"},
		additionalProperties: false,
	},
	required: ["module"]
} as const;

export const roomIvmPost = (
	varhub: Hub,
	loggers: Map<string, Logger>,
	controllerConfig: {inspect?: boolean} = {}
): FastifyPluginCallback => async (fastify) => {
	fastify.withTypeProvider<JsonSchemaToTsProvider>().post(
		'/room/ivm',
		{schema: {body: bodySchema}},
		async (request, reply) => {
			reply.type("application/json");
			const inspectorValue = request.body.inspect;
			if (inspectorValue && !controllerConfig.inspect) {
				return reply.code(405).send({
					type: "Error",
					message: `inspector is disabled`,
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
			if (typeof request.body.message === "string" ) {
				room.publicMessage = request.body.message;
			}
			
			new TimeoutDestroyController(room, 1000 * 60 * 2 /* 2 min */);
			const apiHelperController = new ApiHelperController(room, apiMap);
			
			const ctrl = new IsolatedVMController(room, moduleParam, {
				config,
				apiHelperController,
				inspector: Boolean(inspectorValue),
				memoryLimitMb: 64,
			});
			ctrl.on("dispose", () => room.destroy())
			
			if (inspectorValue) {
				(room as any)[Symbol.for("varhub:ivm")] = ctrl;
				(room as any)[Symbol.for("varhub:inspect_key")] = randomUUID({});
				if (typeof inspectorValue === "string") {
					const logger = loggers.get(inspectorValue);
					const websocket = logger?.websocket;
					if (logger && websocket?.readyState === 1) {
						const session = ctrl.createInspectorSession();
						session.on("response", (ignored, msg) => websocket.send(msg));
						session.on("notification", (msg) => {
							websocket.send(msg)
						});
						room.on("destroy", () => {
							websocket.close(4000, JSON.stringify({
								type: 'ConnectionClosed',
								message: `room destroyed`
							}))
							session.dispose();
						})
						websocket
							.on("close", () => session.dispose())
							.on("message", (msg) => {
								session.dispatchProtocolMessage(String(msg));
							})
							.resume()
						;
					}
				}
			}
			
			await ctrl.startAsync();
			const roomId = varhub.addRoom(room, integrity);
			return reply.code(200).send({
				id: roomId,
				integrity: integrity ?? null,
				message: room.publicMessage ?? null,
				inspect: (room as any)[Symbol.for("varhub:inspect_key")] ?? null
			});
		}
	);
}
