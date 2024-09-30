import assert from "node:assert";
import { WebSocket } from "ws";
import { describe, it } from "node:test";
import {createServer} from "./utils.js";
import {parse, serialize} from "@flinbein/xjmapper";
import EventEmitter = require("node:events");

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
		this.ws.send(serialize("send", conId, "$rpcResult", callId, error ? 1 : 0, result));
	}
	
	send(conId: number|number[], ...data: any){
		this.ws.send(serialize("send", conId, "$rpcEvent", ...data));
	}
	
	["msg:messageChange"](msg: string){
		this.message = msg
	}
	
	["msg:connectionJoin"](conId: number){
		this.lobbyConnections.add(conId);
	}
	
	["msg:connectionEnter"](conId: number){
		this.lobbyConnections.delete(conId);
		this.onlineConnections.add(conId);
	}
	
	["msg:connectionClosed"](conId: number) {
		this.lobbyConnections.delete(conId);
		this.onlineConnections.delete(conId);
	}
	
	["msg:init"](roomId: string, publicMessage: string|null, integrity: string) {
		this.#roomInitResolvers.resolve(roomId);
		this.roomId = roomId;
		this.message = publicMessage;
		this.integrity = integrity;
	}
	
	async ["msg:connectionMessage"](conId: number, ...args: any[]){
		if (args[0] !== "$rpc") return;
		const [, callId, method, ...callArgs] = args;
		try {
			const fn = this.methods[method] as (...args: any[]) => any;
			const result = await fn.call({connection: conId}, ...callArgs);
			this.#sendResponse(conId, callId, false, result);
		} catch (error) {
			this.#sendResponse(conId, callId, true, error);
		}
	}
	
	join(...conId: number[]){
		this.ws.send(serialize("join", conId));
	}
	
	kick(conId: number|number[], message?: string){
		this.ws.send(serialize("kick", conId, message));
	}
	
	setPublicMessage(msg: string|null) {
		this.ws.send(serialize("publicMessage", msg));
	}
	
	destroy() {
		this.ws.send(serialize("destroy"));
	}
	
	broadcast(...msg: any[]) {
		this.ws.send(serialize("broadcast", "$rpcEvent", ...msg));
	}
}


describe("qjs", {timeout: 30000}, () => {
	it("method and join", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws")
		const roomHandler = new RoomHandler(roomWs, {
			me(arg: any) {
				return 1000 + arg;
			}
		});
		roomHandler.on("connectionEnter", (id) => {
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
		roomHandler.on("connectionEnter", (id) => {
			roomHandler.join(id);
			roomHandler.send(id, "msg", "hello world");
		});
		await roomHandler.init;

		using ws = fastify.injectWebsocket(`/room/${roomHandler.roomId}`);
		const eventPromise = ws.rpcWaitEvent((e) => e === "msg");
		await ws.joinPromise;
		assert.deepEqual(await eventPromise, ["msg", "hello world"]);
	});

	it("kick on enter", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		using roomWs = fastify.injectWebsocket("/room/ws")
		const roomHandler = new RoomHandler(roomWs);
		roomHandler.on("connectionEnter", (id) => {
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
		roomHandler.on("connectionEnter", (id) => {
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
		roomHandler.on("messageChange", (...args) => messages.push(args));
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
		roomHandler.on("connectionEnter", (id) => {
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
		roomHandler.on("connectionEnter", (id) => roomHandler.join(id));
		await roomHandler.init;
		using ws = fastify.injectWebsocket(`/room/${roomHandler.roomId}`);
		const broadcastPromise = ws.rpcWaitEvent((val) => val === "msg")
		await ws.joinPromise;
		roomHandler.broadcast("msg", "hello");
		assert.deepEqual(await broadcastPromise, ["msg", "hello"]);
	});
});