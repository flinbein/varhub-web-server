import type { Hub } from "@flinbein/varhub";
import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify";


const paramsSchema = {
	type: 'object',
	properties: {
		roomId: { type: "string" },
	},
	required: ["roomId"]
} as const;
const querySchema = {
	type: 'object',
	properties: {
		integrity: { type: "string" },
	},
} as const;

export const getRoomMessage = (varhub: Hub): FastifyPluginCallback => async (fastify) => {
	fastify.withTypeProvider<JsonSchemaToTsProvider>().get(
		'/room/:roomId',
		{schema: {params: paramsSchema, querystring: querySchema}},
		({params, query}, reply) => {
			reply.type("application/json");
			const room = varhub.getRoom(params.roomId);
			const roomMessage = room?.publicMessage;
			const integrity = varhub.getRoomIntegrity(params.roomId);
			const integrityMismatch = integrity && integrity !== query.integrity;
			if (!room || integrityMismatch || roomMessage == null) {
				reply.code(404).send({
					type: 'NotFound',
					message: `Room not found OR not public OR wrong room integrity: ${params.roomId}`
				});
			}
			return reply.code(200).send(JSON.stringify(roomMessage));
		}
	);
}