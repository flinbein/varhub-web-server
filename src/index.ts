import process from "node:process";
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import CreateServer from './CreateServer.js';

process.on("uncaughtException", (e) => {
	console.error(e);
});

const argv = await yargs(hideBin(process.argv)).argv;
const port = Number(argv.port ?? 8088);
const host = String(argv.host ?? "0.0.0.0");
const ivmInspect = Boolean(argv.ivmInspect ?? false);

const fastify = await CreateServer({
	config: {ivm: {inspect: ivmInspect}}
});

const result = await fastify.listen({ port, host });
console.log(`Start server on port ${port}, ${result}`);