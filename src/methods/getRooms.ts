import type { Hub } from "@flinbein/varhub";
import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify";


const paramsSchema = {
	type: 'object',
	properties: {
		integrity: { type: "string" },
	},
	required: ["integrity"]
} as const;

export const getRooms = (varhub: Hub): FastifyPluginCallback => async (fastify) => {
	fastify.withTypeProvider<JsonSchemaToTsProvider>().get(
		'/rooms/:integrity',
		{schema: {params: paramsSchema}},
		({params}, reply) => {
			const roomIdSet = varhub.getRoomsByIntegrity(params.integrity);
			const result: Record<string, string> = {};
			for (const roomId of roomIdSet) {
				const room = varhub.getRoom(roomId);
				if (!room) continue;
				const message = room.publicMessage;
				if (message == null) continue;
				result[roomId] = message;
			}
			return reply.code(200).send(result);
		}
	);
}