import type { WebSocket } from "ws";
import type { Room, Connection } from "@flinbein/varhub";
import type { QuickJSController } from "@flinbein/varhub-controller-quickjs";
import { serialize, XJData } from "@flinbein/xjmapper";

export class Logger {
	constructor(private ws: WebSocket) {
		ws.binaryType = "arraybuffer";
	}
	
	log(roomId: string, type: string, ...data: any[]){
		if (this.ws.readyState !== 1) return;
		try {
			const binaryData = serialize(roomId, type, ...data);
			this.ws.send(binaryData);
		} catch (error) {
			const binaryData = serialize(roomId, "error", type);
			this.ws.send(binaryData);
		}
	}
	
	handleRoom(roomId: string, room: Room){
		if (this.ws.readyState !== 1) return;
		for (let e of ["connectionJoin", "connectionClosed", "connectionEnter", "connectionMessage"] as const) {
			const logConnection = (c: Connection, ...args: any[]) => this.log(roomId, "room", e, c.id, ...args);
			room.on(e, logConnection);
			this.ws.on("close", () => room.off(e, logConnection));
			this.ws.on("error", () => room.off(e, logConnection));
		}
		for (let e of ["messageChange", "destroy"] as const) {
			const logData = (...args: any[]) => this.log(roomId, "room", e, ...args);
			room.on(e, logData);
			this.ws.on("close", () => room.off(e, logData));
			this.ws.on("error", () => room.off(e, logData));
		}
	}
	
	handleQuickJS(roomId: string, quickJsController: QuickJSController){
		const logger = this.log.bind(this, roomId, "quickjs", "console");
		quickJsController.on("console", this.log.bind(this, roomId, "quickjs", "console"));
		this.ws.on("close", () => quickJsController.off("console", logger));
		this.ws.on("error", () => quickJsController.off("console", logger));
	}
}