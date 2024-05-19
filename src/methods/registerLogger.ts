import { randomUUID } from "node:crypto";
import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify/types/plugin.js";
import { Logger } from "../Logger.js";

export const registerLogger = (loggers: Map<string, Logger>): FastifyPluginCallback => async (fastify) => {
	fastify.withTypeProvider<JsonSchemaToTsProvider>().get('/log', {websocket: true}, (websocket) => {
		websocket.binaryType = "nodebuffer";
		const id = randomUUID();
		loggers.set(id, new Logger(websocket));
		websocket.on("close", () => {
			loggers.delete(id);
		});
		websocket.on("error", () => {
			loggers.delete(id);
		});
		websocket.send(id);
	});
}