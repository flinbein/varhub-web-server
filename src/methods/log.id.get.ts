import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify/types/plugin.js";
import { Logger } from "../Logger.js";
import { TempMap } from "../TempMap.js";

const paramsSchema = {
	type: 'object',
	properties: {
		loggerId: {type: 'string', maxLength: 255},
	},
	required: ["loggerId"],
	additionalProperties: false
} as const;

export const logIdGet = (loggers: Map<string, Logger>,errorMap: TempMap<string, any>): FastifyPluginCallback => async (fastify) => {
	
	fastify.withTypeProvider<JsonSchemaToTsProvider>().route({
		method: "GET",
		url: '/log/:loggerId',
		schema: {params: paramsSchema},
		preHandler(request, reply, done) {
			const { loggerId } = request.params;
			if (request.headers.upgrade && loggers.has(loggerId)) throw new Error("logger with this id already in use");
			done();
		},
		
		handler(request, reply){
			const { loggerId } = request.params;
			if (!errorMap.has(loggerId)) reply.callNotFound();
			const error = errorMap.get(loggerId);
			if (error == null) return reply.callNotFound();
			errorMap.delete(loggerId);
			try {
				JSON.parse(error);
				return reply.type("application/json").code(200).send(error)
			} catch {}
			return reply.type("text/plain").code(200).send(error)
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