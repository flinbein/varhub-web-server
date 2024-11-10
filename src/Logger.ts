import type { WebSocket } from "ws";
import type { Room, Connection } from "@flinbein/varhub";
import type { QuickJSController } from "@flinbein/varhub-controller-quickjs";
import { serialize } from "@flinbein/xjmapper";

export class Logger {
	#websocket: WebSocket
	
	constructor(ws: WebSocket) {
		this.#websocket = ws;
		ws.pause();
	}
	
	get websocket(){
		return this.#websocket;
	}
	
	log(roomId: string, type: string, ...data: any[]){
		if (this.#websocket.readyState !== 1) return;
		try {
			const binaryData = serialize(roomId, type, ...data);
			this.#websocket.send(binaryData);
		} catch (error) {
			const binaryData = serialize(roomId, "error", type);
			this.#websocket.send(binaryData);
		}
	}
	
	handleRoom(roomId: string, room: Room){
		this.#websocket.isPaused && this.#websocket.resume();
		if (this.#websocket.readyState !== 1) return;
		for (let e of ["connectionJoin", "connectionClosed", "connectionEnter", "connectionMessage"] as const) {
			const logConnection = (c: Connection, ...args: any[]) => this.log(roomId, "room", e, c.id, ...args);
			room.on(e, logConnection);
			this.#websocket.on("close", () => room.off(e, logConnection));
			this.#websocket.on("error", () => room.off(e, logConnection));
		}
		for (let e of ["messageChange", "destroy"] as const) {
			const logData = (...args: any[]) => this.log(roomId, "room", e, ...args);
			room.on(e, logData);
			this.#websocket.on("close", () => room.off(e, logData));
			this.#websocket.on("error", () => room.off(e, logData));
		}
	}
	
	handleQuickJS(roomId: string, quickJsController: QuickJSController){
		this.#websocket.isPaused && this.#websocket.resume();
		const logger = this.log.bind(this, roomId, "quickjs", "console");
		quickJsController.on("console", this.log.bind(this, roomId, "quickjs", "console"));
		this.#websocket.on("close", () => quickJsController.off("console", logger));
		this.#websocket.on("error", () => quickJsController.off("console", logger));
	}
}