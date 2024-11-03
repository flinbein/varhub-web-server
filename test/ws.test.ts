import assert from "node:assert";
import { WebSocket } from "ws";
import { describe, it } from "node:test";
// @ts-ignore
import { createServer, ROOM_EVENT, RoomHandler } from "./utils.js";

describe("ws", {timeout: 30000}, () => {
	it("method and join", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws")
		const roomHandler = new RoomHandler(roomWs, {
			me(arg: any) {
				return 1000 + arg;
			}
		});
		roomHandler.on(ROOM_EVENT.CONNECTION_ENTER, (id) => {
			roomHandler.join(id);
		})
		await roomHandler.init;
		
		using ws = fastify.injectWebsocket(`/room/${roomHandler.roomId}`);
		await ws.joinPromise;
		assert.equal(await ws.rpcCall("me", 55), 1055);
	});

	it("send", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws")
		const roomHandler = new RoomHandler(roomWs);
		roomHandler.on(ROOM_EVENT.CONNECTION_ENTER, (id) => {
			roomHandler.join(id);
			roomHandler.send(id, ["msg"], ["hello world"]);
		});
		await roomHandler.init;

		using ws = fastify.injectWebsocket(`/room/${roomHandler.roomId}`);
		const eventPromise = ws.rpcWaitEvent((e: any) => e === "msg");
		await ws.joinPromise;
		assert.deepEqual(await eventPromise, ["hello world"]);
	});

	it("kick on enter", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws")
		const roomHandler = new RoomHandler(roomWs);
		roomHandler.on(ROOM_EVENT.CONNECTION_ENTER, (id) => {
			roomHandler.kick(id);
		});
		await roomHandler.init;
		const ws = fastify.injectWebsocket(`/room/${roomHandler.roomId}`);
		await assert.rejects(ws.joinPromise, "reject connection");
	});

	it("kick by method", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws")
		const roomHandler = new RoomHandler(roomWs, {
			kickMe() {
				roomHandler.kick(this.connection, "kick-me")
			}
		});
		roomHandler.on(ROOM_EVENT.CONNECTION_ENTER, (id) => {
			roomHandler.join(id);
		});
		await roomHandler.init;

		using ws = fastify.injectWebsocket(`/room/${roomHandler.roomId}`);
		await ws.joinPromise;
		await assert.rejects(ws.rpcCall("kickMe"), (err: any) => err.message === "kick-me")
		assert.equal(ws.readyState, WebSocket.CLOSED);
	})

	it("public message init and change", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws?message=testMessage")
		const roomHandler = new RoomHandler(roomWs);
		const messages: string[][] = []
		roomHandler.on(ROOM_EVENT.MESSAGE_CHANGE, (...args) => messages.push(args));
		await roomHandler.init;
		assert.equal(roomHandler.message, "testMessage");
		roomHandler.setPublicMessage("nextMessage");
		await new Promise(r => setTimeout(r, 100));
		assert.deepEqual(messages, [["nextMessage", "testMessage"]]);
		assert.equal(roomHandler.message, "nextMessage");
	})
	
	it("integrity", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws?integrity=custom:a")
		const roomHandler = new RoomHandler(roomWs);
		roomHandler.on(ROOM_EVENT.CONNECTION_ENTER, (id) => {
			roomHandler.join(id);
		});
		await roomHandler.init;
		assert.equal(roomHandler.integrity, "custom:a");
		using ws1 = fastify.injectWebsocket(`/room/${roomHandler.roomId}?integrity=custom:a`);
		await ws1.joinPromise;
		using ws2 = fastify.injectWebsocket(`/room/${roomHandler.roomId}?integrity=custom:b`);
		await assert.rejects(ws2.joinPromise);
		using ws3 = fastify.injectWebsocket(`/room/${roomHandler.roomId}`);
		await assert.rejects(ws3.joinPromise);
	});
	
	it("wrong integrity", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws?integrity=wrong:a")
		await assert.rejects(roomWs.joinPromise);
	});
	
	it("destroy", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws")
		const roomHandler = new RoomHandler(roomWs);
		await roomHandler.init;
		roomHandler.destroy();
		await new Promise(r => setTimeout(r, 100));
		assert.equal(roomWs.readyState, WebSocket.CLOSED);
	});
	
	it("broadcast", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws")
		const roomHandler = new RoomHandler(roomWs);
		roomHandler.on(ROOM_EVENT.CONNECTION_ENTER, (id) => roomHandler.join(id));
		await roomHandler.init;
		using ws = fastify.injectWebsocket(`/room/${roomHandler.roomId}`);
		const broadcastPromise = ws.rpcWaitEvent((val) => val === "msg")
		await ws.joinPromise;
		roomHandler.broadcast(["msg"], ["hello"]);
		assert.deepEqual(await broadcastPromise, ["hello"]);
	});
});