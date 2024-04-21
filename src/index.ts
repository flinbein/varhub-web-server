import process from "node:process";
import { Hub } from "@flinbein/varhub";
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import Fastify from "fastify";
import fastifyWebSocket from "@fastify/websocket";
import { createRoom } from "./methods/createRoom.js";
import { joinRoom } from "./methods/joinRoom.js";
import { getRoomMessage } from "./methods/getRoomMessage.js";
import { getRooms } from "./methods/getRooms.js";

const argv = await yargs(hideBin(process.argv)).argv;
const port = Number(argv.port ?? 8088);

const varhub = new Hub();
const fastify = Fastify();

await fastify.register(fastifyWebSocket); // enable websockets


await fastify.register(createRoom(varhub)); // POST /room
await fastify.register(joinRoom(varhub)); // WS /room/:roomId
await fastify.register(getRoomMessage(varhub)); // GET /room/:roomId?integrity:string
await fastify.register(getRooms(varhub)); // GET /rooms/:integrity

const result = await fastify.listen({ port });

console.log(`Start server on port ${port}: ${result}`);
