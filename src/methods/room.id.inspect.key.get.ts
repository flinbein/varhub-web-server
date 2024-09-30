import type { Hub } from "@flinbein/varhub";
import { timingSafeEqual } from "node:crypto";
import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify/types/plugin.js";
import { IsolatedVMController } from "@flinbein/varhub-controller-isolated-vm";

const paramsSchema = {
	type: 'object',
	properties: {
		roomId: {type: 'string'},
		inspectorKey: {type: 'string'},
	},
	required: ["roomId", "inspectorKey"],
	additionalProperties: false
} as const;

export const roomIdInspectKey = (varhub: Hub): FastifyPluginCallback => async (fastify) => {
	
	fastify.withTypeProvider<JsonSchemaToTsProvider>().route({
		method: 'GET',
		schema: {params: paramsSchema},
		url: '/room/:roomId/inspect/:inspectorKey',
		async preHandler(request, reply) {
			const {params, query} = request;
			const room = varhub.getRoom(params.roomId);
			const inspectorKey: string = (room as any)[Symbol.for("varhub:inspector_key")] ?? "";
			if (!room || !inspectorKey || !timingSafeEqual(Buffer.from(inspectorKey), Buffer.from(params.inspectorKey))) {
				throw reply.type("application/json").code(404).send({
					type: 'NotFound',
					message: `Room not found OR not wrong inspector key`
				});
			}
			request.requestContext.set("room", room);
			if (!request.headers.upgrade) return; // done GET connection
		},
		
		handler(){
			throw new Error("unavailable");
		},
		
		wsHandler(websocket, request){
			const room = request.requestContext.get("room")!;
			const ctrl: IsolatedVMController = (room as any)[Symbol.for("varhub:ivm")];
			const session = ctrl.createInspectorSession();
			
			session.on("notification", (message) => {
				websocket.send(message);
			})
			session.on("response", (ignored, message) => {
				websocket.send(message);
			})
			websocket.on("message", (data) => {
				session.dispatchProtocolMessage(String(data));
			})
			room.on("destroy", () => {
				websocket.close(4000, JSON.stringify({
					type: 'ConnectionClosed',
					message: `room destroyed`
				}))
				session.dispose();
			})
			websocket.on("close", () => session.dispose());
		}
	});
}