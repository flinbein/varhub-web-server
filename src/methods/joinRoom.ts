import type { Hub } from "@flinbein/varhub";
import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify/types/plugin.js";
import {parse, serialize} from "@flinbein/xjmapper";


const querySchema = {
	type: 'object',
	properties: {
		name: {type: 'string'},
		password: {type: 'string'},
		integrity: {type: 'string'},
		params: {type: 'string'},
	},
	required: ["name"]
} as const;

const paramsSchema = {
	type: 'object',
	properties: {
		roomId: {type: 'string'},
	},
	required: ["roomId"]
} as const;

export const joinRoom = (varhub: Hub): FastifyPluginCallback => async (fastify) => {
	fastify.withTypeProvider<JsonSchemaToTsProvider>().get(
		'/room/:roomId/join',
		{websocket: true, schema: {querystring: querySchema, params: paramsSchema}},
		(websocket, {params, query}) => {
			websocket.binaryType = "nodebuffer";
			const room = varhub.getRoom(params.roomId);
			if (!room) {
				return websocket.close(4000, JSON.stringify({
					type: 'NotFound',
					message: `Room not found: ${params.roomId}`
				}));
			}
			if (query.integrity != null) {
				if (varhub.getRoomIntegrity(params.roomId) !== query.integrity) {
					return websocket.close(4000, JSON.stringify({
						type: 'Integrity',
						message: `Room integrity mismatch: ${query.integrity}`
					}));
				}
			}
			let roomParams = undefined;
			try {
				if (query.params) roomParams = JSON.parse(query.params);
			} catch (error) {
				return websocket.close(4000, JSON.stringify({
					type: 'Format',
					message: `params is not valid JSON`
				}));
			}
			const roomConnection = room?.createConnection(query.name, query.password, roomParams);
			if (!roomConnection.connected) {
				return websocket.close(4000, JSON.stringify({
					type: 'ConnectionClosed',
					message: `room connection closed`
				}));
			}
			roomConnection.on("disconnect", (ignored, reason) => {
				return websocket.close(4000, JSON.stringify({
					type: 'ConnectionClosed',
					message: reason ?? null
				}));
			});
			if (roomConnection.status === "joined") {
				websocket.send(serialize(3, "join"));
			} else {
				roomConnection.once("join", () => {
					return websocket.send(serialize(3, "join"));
				});
			}
			roomConnection.once("join", () => {
				return websocket.send("join");
			});
			roomConnection.on("event", (type, ...args) => {
				if (type === "$rpcEvent") {
					return websocket.send(serialize(2, ...args));
				}
				if (type === "$rpcResult") {
					const [callId, errorCode, result] = args;
					const binaryData = serialize(errorCode ? 1 : 0, callId, result);
					return websocket.send(binaryData);
				}
			});
			websocket.on("message", (data) => {
				if (roomConnection.status !== "joined") {
					return websocket.close(4000, JSON.stringify({
						type: 'Status',
						message: `client is not ready`
					}));
				}
				try {
					const [callId, ...args] = parse(data as any);
					roomConnection.message("$rpc", callId, ...args);
				} catch (e) {
					websocket.close(4000, JSON.stringify({
						type: 'Format',
						message: `wrong WS message format`
					}));
				}
			})
			websocket.on("close", () => roomConnection.leave());
		}
	);
}