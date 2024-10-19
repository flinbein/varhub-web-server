import assert from "node:assert";
import { WebSocket } from "ws";
import { describe, it } from "node:test";
import {createServer} from "./utils.js";
import {parse, serialize} from "@flinbein/xjmapper";


describe("qjs", {timeout: 30000}, () => {
	it("test method", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const responseJson = await fastify.injectPost("/room/qjs", {
			message: 'open',
			module: {
				main: "index.js",
				source: {
					["index.js"]: /* language=javascript */ `
								let counter = 100;
								export function test(){
									return [this.parameters[0], counter++]
								}
							`
				},
			},
		});
		const ws = fastify.injectWebsocket(
			`/room/${responseJson.id}?params=${encodeURIComponent(JSON.stringify(["myName"]))}`
		);
		await ws.joinPromise;
		const rpcRes = await ws.rpcCall("test");
		assert.deepEqual(rpcRes, ["myName", 100]);
		const rpcRes2 = await ws.rpcCall("test");
		assert.deepEqual(rpcRes2, ["myName", 101]);
	});

	it("test dispose", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const responseJson = await fastify.injectPost("/room/qjs", {
			message: 'open',
			module: {
				main: "index.js",
				source: {
					["index.js"]: /* language=javascript */ `
                        import room from "varhub:room";
                        setTimeout(() => room.destroy(), 50);
					`
				},
			},
		});
		using ws = fastify.injectWebsocket(
			`/room/${responseJson.id}?params=${encodeURIComponent(JSON.stringify(["myName"]))}`
		);
		await ws.joinPromise;
		assert.deepEqual(ws.readyState, WebSocket.OPEN);
		await new Promise(resolve => setTimeout(resolve, 70));
		assert.deepEqual(ws.readyState, WebSocket.CLOSED);
	});
	
	it("prepend logger", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		
		const loggerWs = await fastify.injectWebsocket("/log/test-inspector-qjs-id").joinPromise;
		const waitForConsoleMessage = new Promise((resolve, reject) => {
			loggerWs.on("message", (msg) => {
				const data = parse(msg as any);
				if (data[1] === "quickjs" && data[2] === "console" && data[3] === "log") resolve(data[4]);
			});
			loggerWs.on("close", reject);
		})
		
		await fastify.injectPost("/room/qjs", {
			message: 'open',
			async: true,
			logger: "test-inspector-qjs-id",
			module: {
				main: "index.js",
				source: {
					["index.js"]: /* language=javascript */ `
                        console.log("hello");
					`
				},
			},
		});
		assert.equal(await waitForConsoleMessage, "hello", "received console message");
	})
	
	it("public room", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const module = {
			main: "index.js",
			source: {
				["index.js"]: /* language=javascript */ `
						import config from "varhub:config"
                        export const test = () => config;
					`
			},
		}
		const room1Result = await fastify.injectPost("/room/qjs", {
			message: 'room1',
			integrity: true,
			config: {value: "room1config"},
			module,
		});
		const room2Result = await fastify.injectPost("/room/qjs", {
			message: 'room2',
			integrity: true,
			config: {value: "room2config"},
			module,
		});
		const room3Result = await fastify.injectPost("/room/qjs", {
			message: 'room3',
			integrity: false,
			config: {value: "room3config"},
			module,
		});
		assert.equal(room1Result.message, "room1");
		assert.equal(room2Result.message, "room2");
		assert.equal(room3Result.message, "room3");
		const responseGetRooms = await fastify.injectGet(`/rooms/${room1Result.integrity}`);
		assert.deepEqual(Object.values(responseGetRooms).sort(), ["room1","room2"], "found all rooms");
	});
});