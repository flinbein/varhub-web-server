import type { FastifyPluginCallback } from "fastify/types/plugin.js";
import packageJson from "../../package.json" with {type : "json"}
import ivmControllerPackageJson from "@flinbein/varhub-controller-isolated-vm/package.json" with {type : "json"}
import qjsControllerPackageJson from "@flinbein/varhub-controller-quickjs/package.json" with {type : "json"}
import varhubPackageJson from "@flinbein/varhub/package.json" with {type : "json"}
import varhubApiNetworkPackageJson from "@flinbein/varhub-api-network/package.json" with {type : "json"}
import jsonStableHashPackageJson from "@flinbein/json-stable-hash/package.json" with {type : "json"}

export const baseGet = (config: any): FastifyPluginCallback => async (fastify) => {
	const appInfoJson = JSON.stringify({
		name: packageJson.name,
		version: packageJson.version,
		dependencies: {
			ivmController: ivmControllerPackageJson.version,
			qjsController: qjsControllerPackageJson.version,
			varhub: varhubPackageJson.version,
			apiNetwork: varhubApiNetworkPackageJson.version,
			jsonStableHash: jsonStableHashPackageJson.version,
		},
		config,
	})
	
	fastify.get("/", (_request, reply) =>{
		return reply.type("application/json").code(200).send(appInfoJson);
	})
}