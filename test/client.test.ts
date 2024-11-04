import assert from "node:assert";
import { describe, it } from "node:test";
// @ts-ignore
import { createServer, ROOM_EVENT, RoomHandler } from "./utils.js";

describe("client", {timeout: 2000}, () => {
	it("not found", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const ws = fastify.injectWebsocket("/room/999?errorLog=123");
		await new Promise(r => ws.addEventListener("error", r));
		const logData = await fastify.injectGet("log/123");
		assert.equal(logData.type, "NotFound");
	});
	
	it("kick reason ivm", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const responseJson = await fastify.injectPost("/room/ivm", {
			message: 'open',
			module: {
				main: "index.js",
				source: {
					["index.js"]: /* language=javascript */ `
                        import room from "varhub:room";
                        room.on("connection", c => c.close("custom-close-reason"))
					`
				},
			},
		});
		const ws = fastify.injectWebsocket(`/room/${responseJson.id}?errorLog=123`);
		await new Promise(r => ws.addEventListener("error", r));
		const logData = await fastify.injectGet("log/123");
		assert.deepEqual(logData, {type: "Closed", message: "custom-close-reason"});
	})
	
	it("kick reason qjs", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const responseJson = await fastify.injectPost("/room/qjs", {
			message: 'open',
			module: {
				main: "index.js",
				source: {
					["index.js"]: /* language=javascript */ `
                        import room from "varhub:room";
                        room.on("connection", c => c.close("custom-close-reason"))
					`
				},
			},
		});
		const ws = fastify.injectWebsocket(`/room/${responseJson.id}?errorLog=123`);
		await new Promise(r => ws.addEventListener("error", r));
		const logData = await fastify.injectGet("log/123");
		assert.deepEqual(logData, {type: "Closed", message: "custom-close-reason"});
	})
	
	it("kick reason ws", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const roomWs = fastify.injectWebsocket("/room/ws");
		const roomHandler = new RoomHandler(roomWs);
		roomHandler.on(ROOM_EVENT.CONNECTION_ENTER, (id) => {
			roomHandler.kick(id, "custom-close-reason");
		});
		await roomHandler.init;
		const ws = fastify.injectWebsocket(`/room/${roomHandler.roomId}?errorLog=123`);
		await new Promise(r => ws.addEventListener("error", r));
		const logData = await fastify.injectGet("log/123");
		assert.deepEqual(logData, {type: "Closed", message: "custom-close-reason"});
	})
	
	it("wrong integrity reason ", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const responseJson = await fastify.injectPost("/room/ivm", {
			message: 'open',
			integrity: true,
			module: {
				main: "index.js",
				source: {
					["index.js"]: /* language=javascript */ `
                        import room from "varhub:room";
                        room.on("connection", c => c.close("custom-close-reason"))
					`
				},
			},
		});
		const ws = fastify.injectWebsocket(`/room/${responseJson.id}?errorLog=123`);
		await new Promise(r => ws.addEventListener("error", r));
		const logData = await fastify.injectGet("log/123");
		assert.equal(logData.type, "NotFound");
	})
	
	it("inspector reason ", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const responseJson = await fastify.injectPost("/room/ivm", {
			message: 'open',
			inspect: true,
			module: {
				main: "index.js",
				source: {
					["index.js"]: /* language=javascript */ `
                        import room from "varhub:room";
                        room.on("connection", c => c.close("custom-close-reason"))
					`
				},
			},
		});
		const ws = fastify.injectWebsocket(`/room/${responseJson.id}?errorLog=123&allowInspect=false`);
		await new Promise(r => ws.addEventListener("error", r));
		const logData = await fastify.injectGet("log/123");
		assert.equal(logData.type, "Inspect");
	})
	
	it("kick reason params", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const roomWs = fastify.injectWebsocket("/room/ws");
		const roomHandler = new RoomHandler(roomWs);
		await roomHandler.init;
		const ws = fastify.injectWebsocket(`/room/${roomHandler.roomId}?params=notArray&errorLog=123`);
		await new Promise(r => ws.addEventListener("error", r));
		const logData = await fastify.injectGet("log/123");
		assert.deepEqual(logData, {type: "Format", message: "params is not valid JSON array"});
	})
});