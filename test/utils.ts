import { WebSocket } from "ws";
import CreateServer from "../src/CreateServer.js";
import { Hub } from "@flinbein/varhub";
import {parse, serialize} from "@flinbein/xjmapper";
import type { Logger } from "../src/Logger.js";
import EventEmitter from "node:events";

type MockWebsocket = WebSocket & Disposable & {
	joinPromise: Promise<MockWebsocket>,
	rpcCall: (method: string, ...args: any) => Promise<any>,
	inspectorCall: (method: string, params: object) => Promise<any>,
	inspectorWaitMethod: (method: string, filter?: (data: any) => any) => Promise<any>,
	rpcWaitEvent: (filter?: (data: any) => any) => Promise<any[]>,
	inspectorCreateContextMap: () => ReturnType<typeof inspectorCreateContextMap>,
	inspectorEval: (contextUniqueId: any, expression: string) => ReturnType<typeof inspectorEval>,
}
export const createServer = async (config?: {
	varhub?: Hub
}): Promise<Awaited<ReturnType<typeof CreateServer>> & {
	url: string,
	wsUrl: string,
	loggers: Map<string, Logger>
	varhub: Hub,
	injectPost: (path: string, payload: any) => any
	injectGet: (path: string) => any
	injectWebsocket: (path: string) => MockWebsocket
}> => {
	const varhub = config?.varhub ?? new Hub();
	const loggers = new Map();
	const fastify = await CreateServer({varhub, loggers, config: {ivm: {inspect: true}}});
	fastify.addHook("onClose", () => {
		for (let roomsKey of varhub.getRooms()) {
			const room = varhub.getRoom(roomsKey);
			try {
				room?.destroy();
			} catch {}
		}
	});
	const url = await fastify.listen({port: 0});
	(fastify as any).loggers = loggers;
	(fastify as any).varhub = varhub;
	(fastify as any).url = url;
	const wsUrl = (fastify as any).wsUrl = url.replace(/^http/, "ws");
	(fastify as any).injectMethod = (method: any, path: string, payload: any) => fastify.inject({
		method,
		url: path,
		headers: {"content-type": "application/json",},
		payload: payload === undefined ? undefined : JSON.stringify(payload),
	}).then(({payload, statusCode}) => {
		if (statusCode === 200) return JSON.parse(payload);
		throw JSON.parse(payload);
	});
	(fastify as any).injectPost = (fastify as any).injectMethod.bind(fastify, "POST");
	(fastify as any).injectGet = (fastify as any).injectMethod.bind(fastify, "GET");
	(fastify as any).injectWebsocket = (path: string) => {
		const ws = new WebSocket(`${wsUrl}${path}`);
		const joinPromise = new Promise<MockWebsocket>((resolve, reject) => {
			const clear = <T extends any[]>(fn: (...arg: T) => void, ...val: T) => {
				ws.off("open", onOpen);
				ws.off("close", onClose);
				ws.off("error", onError);
				fn?.(...val);
			}
			const onOpen = () => clear(resolve, ws as any);
			const onClose = (ignored: any, message: any) => {
				clear(reject, message ? JSON.parse(message) : message);
			}
			const onError = (e: any)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              => {
				clear(reject, e);
			}
			ws.on("open", onOpen);
			ws.on("close", onClose);
			ws.on("error", onError);
		});
		joinPromise.catch(() => {});
		(ws as any).joinPromise = joinPromise;
		(ws as any).rpcCall = (...callArgs: any[]) => (rpcCall as any)(ws, ...callArgs);
		(ws as any).inspectorCall = (...callArgs: any[]) => (inspectorCall as any)(ws, ...callArgs);
		(ws as any).rpcWaitEvent = (...callArgs: any[]) => (rpcWaitEvent as any)(ws, ...callArgs);
		(ws as any).inspectorWaitMethod = (...callArgs: any[]) => (inspectorWaitMethod as any)(ws, ...callArgs);
		(ws as any).inspectorCreateContextMap = (...callArgs: any[]) => (inspectorCreateContextMap as any)(ws, ...callArgs);
		(ws as any).inspectorEval = (...callArgs: any[]) => (inspectorEval as any)(ws, ...callArgs);
		(ws as any)[Symbol.dispose] = () => {
			try {
				ws.close(4000, "mock closed");
			} catch {}
		}
		return ws as any;
	}
	return fastify as any;
}

let rpcId = 10_000;
async function rpcCall(ws: WebSocket, method: string, ...args: any[]) {
	const id = rpcId++;
	const outMessage = serialize("$rpc", undefined, 0, id, [method], args);
	return new Promise((resolve, reject) => {
		const onMessage = (data: any) => {
			const inMessage = parse(data as any);
			if (!Array.isArray(inMessage) || inMessage.length < 3) return;
			const [resultKey, _channelId, inCode, inId, inResult = undefined] = inMessage;
			if (resultKey !== "$rpc") return;
			if (_channelId !== undefined) return;
			if (inId !== id) return;
			clear(inCode === 0 ? resolve : reject, inResult);
		}
		const onClose = (_ignored: any, msg: any) => clear(reject, JSON.parse(msg));
		const clear = (fn?: (e: any) => void, data?: any) => {
			ws.off("message", onMessage);
			ws.off("close", onClose);
			fn?.(data);
		}
		ws.on("close", onClose);
		ws.on("message", onMessage);
		ws.send(outMessage);
	})
}

async function inspectorCall(ws: WebSocket, method: string, params: object): Promise<any> {
	const id = -(rpcId++);
	const outMessage = JSON.stringify({id, method, params});
	return new Promise((resolve, reject) => {
		const onMessage = (data: any) => {
			const {id: inId = null, result: inResult = null} = JSON.parse(String(data));
			if (inId !== id) return;
			clear(resolve, inResult);
		}
		const onClose = (msg: any) => clear(reject, msg);
		const clear = (fn?: (e: any) => void, data?: any) => {
			ws.off("message", onMessage);
			ws.off("close", onClose);
			fn?.(data);
		}
		ws.on("close", onClose);
		ws.on("message", onMessage);
		ws.send(outMessage);
	})
}

async function inspectorWaitMethod(ws: WebSocket, method: string, filter: (arg: any) => any = () => true) {
	return new Promise((resolve, reject) => {
		const onMessage = (data: any) => {
			const {method:inMethod = null, params: inResult = null} = JSON.parse(String(data));
			if (inMethod !== method) return;
			if (!filter(inResult)) return;
			clear(resolve, inResult);
		}
		const onClose = (msg: any) => clear(reject, msg);
		const clear = (fn?: (e: any) => void, data?: any) => {
			ws.off("message", onMessage);
			ws.off("close", onClose);
			fn?.(data);
		}
		ws.on("close", onClose);
		ws.on("message", onMessage);
	})
}

async function rpcWaitEvent(ws: WebSocket, filter: (...arg: any) => any = () => true) {
	return new Promise((resolve, reject) => {
		const onMessage = (data: any) => {
			const [rpcKey, channelId, operationCode, path, inData] = parse(data as any);
			if (rpcKey !== "$rpc") return;
			if (channelId !== undefined) return;
			if (operationCode !== 4) return;
			if (!filter(...path as any)) return;
			clear(resolve, inData);
		}
		const onClose = (msg: any) => clear(reject, msg);
		const clear = (fn?: (e: any) => void, data?: any) => {
			ws.off("message", onMessage);
			ws.off("close", onClose);
			fn?.(data);
		}
		ws.on("close", onClose);
		ws.on("message", onMessage);
	})
}


async function inspectorEval(ws: WebSocket, uniqueContextId: any, expression: string): Promise<{result: {type: string, value: any}}> {
	return inspectorCall(ws, "Runtime.evaluate", {
		allowUnsafeEvalBlockedByCSP: false,
		awaitPromise: false,
		expression,
		generatePreview: true,
		includeCommandLineAPI: true,
		objectGroup: "console",
		replMode: true,
		returnByValue: false,
		silent: false,
		uniqueContextId,
		userGesture: true
	});
}

function inspectorCreateContextMap(ws: WebSocket): Map<number, string> {
	const contextMap = new Map();
	ws.on("message", (msg) => {
		const data = JSON.parse(String(msg));
		if (data.method === "Runtime.executionContextCreated") {
			contextMap.set(data.params.context.id, data.params.context.uniqueId);
		}
	});
	return contextMap;
}

export const enum ROOM_EVENT {
	INIT = 0,
	MESSAGE_CHANGE = 1,
	CONNECTION_JOIN = 2,
	CONNECTION_ENTER = 3,
	CONNECTION_MESSAGE = 4,
	CONNECTION_CLOSED = 5,
}
export const enum ROOM_ACTION {
	JOIN = 0,
	KICK = 1,
	PUBLIC_MESSAGE = 2,
	DESTROY = 3,
	SEND = 4,
	BROADCAST = 5,
}

export class RoomHandler extends EventEmitter<any> {
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