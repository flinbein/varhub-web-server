import assert from "node:assert";
import { WebSocket } from "ws";
import { describe, it } from "node:test";
// @ts-ignore
import {createServer} from "./utils.js";


describe("ivm", {timeout: 30000}, () => {
	it("test method", {timeout: 1000}, async () => {
		await using fastify = await createServer();
		const responseJson = await fastify.injectPost("/room/ivm", {
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
		const responseJson = await fastify.injectPost("/room/ivm", {
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
	
	it("test starting inspector", {timeout: 3000}, async () => {
		await using fastify = await createServer();
		using inspectorWs = fastify.injectWebsocket(`/log/test-inspector-ivm-id`);
		await inspectorWs.joinPromise;
		const contextMap = inspectorWs.inspectorCreateContextMap();
		void inspectorWs.inspectorCall("Runtime.enable", {});
		void inspectorWs.inspectorCall("Debugger.enable", {maxScriptsCacheSize:10000000});
		
		await new Promise(r => setTimeout(r, 50));
		
		const responseJson = await fastify.injectPost("/room/ivm", {
			inspect: "test-inspector-ivm-id",
			message: 'open',
			module: {
				main: "index.js",
				source: {
					["index.js"]: /* language=javascript */ `
						globalThis.value = 10
                        export const getValue = () => value;
                        export const setValue = (v) => globalThis.value = v;
                        export const evaluate = eval;
					`
				},
			},
		});
		
		using ws = await fastify.injectWebsocket(
			`/room/${responseJson.id}?params=${encodeURIComponent(JSON.stringify(["myName"]))}`
		).joinPromise;
		const waitMethodLogPromise = inspectorWs.inspectorWaitMethod("Runtime.consoleAPICalled");
		await ws.rpcCall("evaluate", "console.log(10000 + value)");
		const consoleCallMessage = await waitMethodLogPromise;
		assert.equal(consoleCallMessage.args[0].value, 10010, "console message 1");
		
		await inspectorWs.inspectorEval(contextMap.get(consoleCallMessage.executionContextId), "globalThis.value = 7")
		assert.equal(await ws.rpcCall("getValue"), 7, "read value after console command");
	});
	
	it("test later inspector", {timeout: 3000}, async () => {
		await using fastify = await createServer();
		
		const responseJson = await fastify.injectPost("/room/ivm", {
			inspect: true,
			message: 'open',
			module: {
				main: "index.js",
				source: {
					["index.js"]: /* language=javascript */ `
						globalThis.value = 10
                        export const getValue = () => value;
                        export const setValue = (v) => globalThis.value = v;
                        export const evaluate = eval;
					`
				},
			},
		});
		const inspectorWsUrl = `/room/${responseJson.id}/inspect/${responseJson.inspect}`
		using inspectorWs = await fastify.injectWebsocket(inspectorWsUrl).joinPromise;
		const contextMap = inspectorWs.inspectorCreateContextMap();
		void inspectorWs.inspectorCall("Runtime.enable", {});
		void inspectorWs.inspectorCall("Debugger.enable", {maxScriptsCacheSize:10000000});
		
		using ws = await fastify.injectWebsocket(
			`/room/${responseJson.id}?params=${encodeURIComponent(JSON.stringify(["myName"]))}`
		).joinPromise;
		
		const methodLogPromise = inspectorWs.inspectorWaitMethod("Runtime.consoleAPICalled")
		await ws.rpcCall("evaluate", "console.log(1)");
		const methodLogResult = await methodLogPromise;
		
		await inspectorWs.inspectorEval(contextMap.get(methodLogResult.executionContextId), "globalThis.value = 5")
		assert.equal(await ws.rpcCall("getValue"), 5, "read value after console command");
	});
});