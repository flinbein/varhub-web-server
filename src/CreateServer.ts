import { Hub, type Room, type Connection } from "@flinbein/varhub";
import Fastify from "fastify";
import { fastifyRequestContext } from '@fastify/request-context';
import fastifyWebSocket from "@fastify/websocket";
import cors from '@fastify/cors'

import { Logger } from "./Logger.js";
import { roomQjsPost } from "./methods/room.qjs.post.js";
import { roomIvmPost } from "./methods/room.ivm.post.js";
import { roomIdGet } from "./methods/room.id.get.js";
import { roomsIntegrityGet } from "./methods/rooms.integrity.get.js";
import { logIdGet } from "./methods/log.id.get.js";
import { roomIdInspectKey } from "./methods/room.id.inspect.key.get.js";
import { baseGet } from "./methods/get.js";
import { roomWsGet } from "./methods/room.ws.get.js";
import { TempMap } from "./TempMap.js";

declare module '@fastify/request-context' {
	interface RequestContextData {
		varhub: Hub,
		loggers: Map<string, Logger>,
		room?: Room
		roomId?: string
		connection?: Connection
		flushEvents?: () => any[][]
	}
}

type ServerConfig = {
	ivm?: {inspect?: boolean}
}
export default async function (
	{varhub = new Hub(), loggers = new Map<string, Logger>, config = {}}: {
		varhub?: Hub,
		loggers?: Map<string, Logger>,
		config?: ServerConfig,
	} = {}
) {
	const fastify = Fastify();
	const errorsTempMap = new TempMap<string, any>(10000);
	
	await fastify.register(cors); // allow cors
	await fastify.register(fastifyRequestContext, {
		defaultStoreValues: {varhub, loggers}
	}); // add async context
	await fastify.register(fastifyWebSocket); // enable websockets
	
	fastify.addHook("preValidation", async (request, reply) => {
		const userAgentHeader = request.headers["user-agent"];
		if (userAgentHeader?.includes("VARHUB-API")) {
			reply.type("application/json").code(403).send({
				type: "Forbidden",
				message: `forbidden for user-agent: ${userAgentHeader}`,
			});
		}
	})
	
	fastify.addHook('onSend', (request, reply, payload, done) => {
		if (!request.headers.upgrade) return done(null, payload);
		const errorLog: string | undefined = (request.query as any).errorLog;
		if (!reply.statusCode || reply.statusCode < 400) return done(null, payload);
		if (!errorLog) return done(null, payload);
		errorsTempMap.set(errorLog, payload);
		done(null, payload)
	})
	
	fastify.addHook("onClose", () => {
		errorsTempMap.clear();
	})
	
	await fastify.register(baseGet(config)); // GET /
	await fastify.register(roomQjsPost(varhub, loggers)); // POST /room, /room/quickjs
	await fastify.register(roomIvmPost(varhub, loggers, config.ivm)); // POST /room/ivm
	await fastify.register(roomWsGet(varhub)); // WS /room/client
	await fastify.register(roomIdGet(varhub)); // WS /room/:roomId
	await fastify.register(roomIdInspectKey(varhub)); // WS /room/:id/inspect/:key
	await fastify.register(roomsIntegrityGet(varhub)); // GET /rooms/:integrity
	await fastify.register(logIdGet(loggers, errorsTempMap)); // WS /log
	
	return fastify;
}