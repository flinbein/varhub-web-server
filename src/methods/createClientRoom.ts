import { Connection, Hub, Room } from "@flinbein/varhub";
import type {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyPluginCallback } from "fastify/types/plugin.js";
import {parse, serialize} from "@flinbein/xjmapper";


const querySchema = {
	type: 'object',
	properties: {
		integrity: {type: 'string'}
	}
} as const;

const paramsSchema = {
	type: 'object',
	properties: {
		roomId: {type: 'string'},
		raw: {type: 'boolean'}
	},
	required: ["roomId"],
	additionalProperties: false
} as const;

export const createClientRoom = (varhub: Hub): FastifyPluginCallback => async (fastify) => {
	fastify.withTypeProvider<JsonSchemaToTsProvider>().get(
		'/room/client',
		{websocket: true, schema: {querystring: querySchema, params: paramsSchema}},
		(websocket, {params, query}) => {
			const room = new Room();
			const integrity = query.integrity ? `client-${query.integrity}` : undefined;
			const roomId = varhub.addRoom(room, integrity);
			if (roomId === null) {
				return websocket.close(4000, JSON.stringify({
					type: 'ConnectionClosed',
					message: `can not create room`
				}));
			}
			const sender = (arg: any) => (...args: any[]) => {
				const serializableArgs = args.map(v => (v instanceof Connection) ? v.id : v);
				websocket.send(serialize(arg, ...serializableArgs));
			}
			room.on("messageChange", sender("messageChange"));
			room.on("connectionJoin", sender("connectionJoin"));
			room.on("connectionEnter", sender("connectionEnter"));
			room.on("connectionMessage", sender("connectionMessage"));
			room.on("connectionClosed", sender("connectionClosed"));
			room.on("destroy", () => {
				websocket.close(4000, JSON.stringify({
					type: 'ConnectionClosed',
					message: `can not create room`
				}));
			});
			
			const findAllConnections = (v: number[]) => {
				return [...room.getJoinedConnections(), ...room.getLobbyConnections()].filter(c => v.includes(c.id));
			}
			const findJoinedConnections = (v: number[]) => {
				return room.getJoinedConnections().filter(c => v.includes(c.id));
			}
			
			const findLobbyConnections = (v: number[]) => {
				return room.getLobbyConnections().filter(c => v.includes(c.id));
			}
			websocket.on("message", (data) => {
				const [cmd, ...args] = parse(data as any);
				if (cmd === "join") {
					for (let c of findLobbyConnections(args.map((v) => Number(v)))) {
						room.join(c)
					}
				}
				if (cmd === "kick") {
					for (let c of findAllConnections(args.map((v) => Number(v)))) {
						room.kick(c)
					}
				}
				if (cmd === "publicMessage") {
					room.publicMessage = args[0] == null ? null : String(args[0]);
				}
				if (cmd === "destroy") {
					room.destroy()
				}
				if (cmd === "send") {
					const [idArg, ...sendArgs] = args;
					const idArgList = Array.isArray(idArg) ? idArg : [idArg];
					for (let c of findJoinedConnections(idArgList.map((v) => Number(v)))) {
						c.sendEvent(...sendArgs);
					}
				}
				if (cmd === "broadcast") {
					const [...sendArgs] = args;
					for (let c of room.getJoinedConnections()) {
						c.sendEvent(...sendArgs);
					}
				}
				
			});
			websocket.on("close", () => room.destroy());
		}
	);
}