import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify/types/plugin.js";
import { Logger } from "../Logger.js";

const paramsSchema = {
	type: 'object',
	properties: {
		loggerId: {type: 'string', maxLength: 255},
	},
	required: ["loggerId"],
	additionalProperties: false
} as const;

export const logIdGet = (loggers: Map<string, Logger>): FastifyPluginCallback => async (fastify) => {
	
	fastify.withTypeProvider<JsonSchemaToTsProvider>().route({
		method: "GET",
		url: '/log/:loggerId',
		schema: {params: paramsSchema},
		preHandler(request, reply, done) {
			const { loggerId } = request.params;
			if (loggers.has(loggerId)) throw new Error("logger with this id already in use");
			done();
		},
		handler(){
			throw new Error("unimplemented");
		},
		async wsHandler(websocket, request) {
			const { loggerId } = request.params;
			if (loggers.has(loggerId)) {
				websocket.close(4000, JSON.stringify({
					type: 'Error',
					message: `logger with this id already in use`
				}));
			}
			const logger = new Logger(websocket);
			loggers.set(loggerId, logger);
			websocket.on("close", () => {
				loggers.delete(loggerId)
			});
		}
		
	});
}