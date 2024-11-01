import assert from "node:assert";
import { WebSocket } from "ws";
import { describe, it } from "node:test";
import {parse, serialize} from "@flinbein/xjmapper";
import EventEmitter = require("node:events");
import {createServer} from "./utils.js";

const enum ROOM_EVENT {
	INIT = 0,
	MESSAGE_CHANGE = 1,
	CONNECTION_JOIN = 2,
	CONNECTION_ENTER = 3,
	CONNECTION_MESSAGE = 4,
	CONNECTION_CLOSED = 5,
}
const enum ROOM_ACTION {
	JOIN = 0,
	KICK = 1,
	PUBLIC_MESSAGE = 2,
	DESTROY = 3,
	SEND = 4,
	BROADCAST = 5,
}

class RoomHandler extends EventEmitter<any> {
	message: string|null = null;
	lobbyConnections = new Set<number>();
	onlineConnections = new Set<number>();
	#roomInitResolvers = (Promise as any).withResolvers();
	init = this.#roomInitResolvers.promise as Promise<string>;
	roomId: string|null = null;
	integrity: string|null = null;
	
	constructor(private ws: WebSocket, private methods?: any){
		super();
		ws.on("message", (msg: any) => {
			const [eventName, ...params] = parse(msg);
			this.emit(eventName, ...params);
			if ((this as any)[`msg:${eventName}`]) {
				(this as any)[`msg:${eventName}`](...params);
			}
			
		});
		ws.on("close", (code, reason) => {
			this.#roomInitResolvers.reject(new Error(`room closed: ${code} ${reason}`));
		});
	}
	
	#sendResponse(conId: number|number[], callId: any, error: boolean, result: any){
		this.ws.send(serialize(ROOM_ACTION.SEND, conId, "$rpc", undefined, error ? 3 : 0, callId, result));
	}
	
	send(conId: number|number[], path: any[], msg: any[]){
		this.ws.send(serialize(ROOM_ACTION.SEND, conId, "$rpc", undefined, 4,  path, msg));
	}
	
	[`msg:${ROOM_EVENT.MESSAGE_CHANGE}`](msg: string){
		this.message = msg
	}
	
	[`msg:${ROOM_EVENT.CONNECTION_JOIN}`](conId: number){
		this.lobbyConnections.add(conId);
	}
	
	[`msg:${ROOM_EVENT.CONNECTION_ENTER}`](conId: number){
		this.lobbyConnections.delete(conId);
		this.onlineConnections.add(conId);
	}
	
	[`msg:${ROOM_EVENT.CONNECTION_CLOSED}`](conId: number) {
		this.lobbyConnections.delete(conId);
		this.onlineConnections.delete(conId);
	}
	
	[`msg:${ROOM_EVENT.INIT}`](roomId: string, publicMessage: string|null, integrity: string) {
		this.#roomInitResolvers.resolve(roomId);
		this.roomId = roomId;
		this.message = publicMessage;
		this.integrity = integrity;
	}
	
	async [`msg:${ROOM_EVENT.CONNECTION_MESSAGE}`](conId: number, ...args: any[]){
		if (args[0] !== "$rpc") return;
		const [_key, _channelId, _operationId, callId, methodPath, callArgs] = args;
		try {
			let target: any = this.methods;
			for (const m of methodPath) target = target[m];
			const result = await target.call({connection: conId}, ...callArgs);
			this.#sendResponse(conId, callId, false, result);
		} catch (error) {
			this.#sendResponse(conId, callId, true, error);
		}
	}
	
	join(...conId: number[]){
		this.ws.send(serialize(ROOM_ACTION.JOIN, conId));
	}
	
	kick(conId: number|number[], message?: string){
		this.ws.send(serialize(ROOM_ACTION.KICK, conId, message));
	}
	
	setPublicMessage(msg: string|null) {
		this.ws.send(serialize(ROOM_ACTION.PUBLIC_MESSAGE, msg));
	}
	
	destroy() {
		this.ws.send(serialize(ROOM_ACTION.DESTROY));
	}
	
	broadcast(path: any[], msg: any[]) {
		this.ws.send(serialize(ROOM_ACTION.BROADCAST, "$rpc", undefined, 4, path, msg));
	}
}

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