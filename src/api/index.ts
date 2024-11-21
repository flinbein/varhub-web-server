import type { Hub, ApiSource } from "@flinbein/varhub";
import configureNetworkApi from "./network.js";

export default function(hub: Hub): ApiSource {
	return {
		"network": configureNetworkApi(hub)
	};
}
