import type { Hub } from "@flinbein/varhub";
import { timingSafeEqual } from "node:crypto";
import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify/types/plugin.js";
import {parse, serialize} from "@flinbein/xjmapper";


const querySchema = {
	type: 'object',
	properties: {
		integrity: {type: 'string'},
		params: {type: 'string'}
	},
	additionalProperties: false
} as const;

const paramsSchema = {
	type: 'object',
	properties: {
		roomId: {type: 'string'},
	},
	required: ["roomId"],
	additionalProperties: false
} as const;

export const roomIdGet = (varhub: Hub): FastifyPluginCallback => async (fastify) => {
	
	fastify.withTypeProvider<JsonSchemaToTsProvider>().route({
		method: 'GET',
		schema: {querystring: querySchema, params: paramsSchema},
		url: '/room/:roomId',
		async preHandler(request, reply) {
			const {params, query} = request;
			const room = varhub.getRoom(params.roomId);
			const roomIntegrity = varhub.getRoomIntegrity(params.roomId);
			const needCheckIntegrity = Boolean(roomIntegrity || query.integrity);
			const integrityMismatch = needCheckIntegrity && !timingSafeEqual(Buffer.from(roomIntegrity ?? ""), Buffer.from(query.integrity ?? ""));
			if (!room || integrityMismatch) {
				return reply.type("application/json").code(404).send({
					type: 'NotFound',
					message: `Room not found OR not public OR wrong room integrity`
				});
			}
			request.requestContext.set("room", room);
			if (!request.headers.upgrade) return true; // done GET connection
			
			// WS CONNECTION
			let roomParams = undefined;
			try {
				if (query.params) roomParams = [...JSON.parse(query.params)];
			} catch (error) {
				return reply.type("application/json").code(400).send({
					type: 'Format',
					message: `params is not valid JSON array`
				});
			}
			const roomConnection = room.createConnection();
			
			const eventsCache: any[][] = [];
			const onEvent = (...args: any[]) => {
				eventsCache.push(args);
			};
			const onClose = () => {
				clear();
				roomConnection.off("event", onEvent);
				roomConnection.leave("client disconnected");
				reject();
			}
			const onJoin = () => {clear(); resolve();}
			const onDisconnect = () => {
				roomConnection.off("event", onEvent);
				clear();
				reject();
			}
			const clear = () => {
				roomConnection.off("disconnect", onDisconnect);
				roomConnection.off("join", resolve);
				request.raw.off("close", onClose);
			}
			roomConnection.on("event", onEvent);
			
			const {promise, resolve, reject} = Promise.withResolvers<void>();
			roomConnection.once("disconnect", onDisconnect);
			roomConnection.once("join", onJoin);
			request.raw.once("close", onClose);
			request.requestContext.set("connection", roomConnection);
			request.requestContext.set("flushEvents", () => {
				roomConnection.off("event", onEvent);
				return eventsCache;
			});
			roomConnection.enter(...(roomParams ?? []));
			if (roomConnection.status === "joined") {
				clear(); // do not need to wait for promise, client already connected
				return;
			}
			return promise;
		},
		
		handler(req, reply){
			const room = req.requestContext.get("room");
			const roomMessage = room?.publicMessage;
			if (!room || roomMessage == null) {
				reply.code(404).send({
					type: 'NotFound',
					message: `Room not found OR not public OR wrong room integrity`
				});
			}
			return reply.code(200).send(JSON.stringify(roomMessage));
		},
		
		wsHandler(websocket, request){
			const roomConnection = request.requestContext.get("connection");
			const events = request.requestContext.get("flushEvents")?.() ?? [];
			
			for (let event of events) {
				websocket.send(serialize(...event));
			}
			
			if (!roomConnection) return websocket.close(4000, JSON.stringify({
				type: 'Error',
				message: "wrong connection id"
			}));
			
			roomConnection.on("disconnect", (ignored, reason) => {
				if (typeof reason === "string" && reason.length > 512) reason = "#too long#"
				return websocket.close(4000, JSON.stringify({
					type: 'ConnectionClosed',
					message: reason == null ? reason : String(reason)
				}));
			});
			
			roomConnection.on("event", (...eventArgs) => {
				return websocket.send(serialize(...eventArgs));
			});
			
			websocket.on("message", (data) => {
				try {
					roomConnection.message(...parse(data as any));
				} catch (e) {
					websocket.close(4000, JSON.stringify({
						type: 'Format',
						message: `wrong WS message format`
					}));
				}
			})
			websocket.on("close", () => roomConnection.leave());
		}
	});
}