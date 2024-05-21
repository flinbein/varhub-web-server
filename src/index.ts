import process from "node:process";
import { Hub } from "@flinbein/varhub";
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import Fastify from "fastify";
import fastifyWebSocket from "@fastify/websocket";
import cors from '@fastify/cors'
import { createQuickJSRoom } from "./methods/createQuickJSRoom.js";
import { joinRoom } from "./methods/joinRoom.js";
import { getRoomMessage } from "./methods/getRoomMessage.js";
import { getRooms } from "./methods/getRooms.js";
import { registerLogger } from "./methods/registerLogger.js";
import { Logger } from "./Logger.js";
import { createClientRoom } from "./methods/createClientRoom.js";

process.on("uncaughtException", () => {});

const argv = await yargs(hideBin(process.argv)).argv;
const port = Number(argv.port ?? 8088);

const varhub = new Hub();
const loggers = new Map<string, Logger>();

const fastify = Fastify();

await fastify.register(cors); // allow cors
await fastify.register(fastifyWebSocket); // enable websockets


await fastify.register(createQuickJSRoom(varhub, loggers)); // POST /room, /room/quickjs
await fastify.register(createClientRoom(varhub)); // WS /room/client
await fastify.register(joinRoom(varhub)); // WS /room/:roomId
await fastify.register(getRoomMessage(varhub)); // GET /room/:roomId?integrity:string
await fastify.register(getRooms(varhub)); // GET /rooms/:integrity
await fastify.register(registerLogger(loggers)); // WS /log

const result = await fastify.listen({ port, host: "0.0.0.0" });

console.log(`Start server on port ${port}: ${result}`);
