import createNetworkApi from "@flinbein/varhub-api-network";

export default createNetworkApi({
	fetchPoolTimeout: 10_000, // 10s
	fetchPoolCount: 10,
	fetchMaxAwaitingProcesses: 100,
	fetchMaxActiveCount: 5,
	ipBlacklist: [
		"0.0.0.0/8", // Software
		"10.0.0.0/8", // Private network
		"100.64.0.0/10", // Private network
		"127.0.0.0/8", // Host
		"169.254.0.0/16", // Subnet
		"172.16.0.0/12", // Private network
		"192.0.0.0/24", // Private network
		"192.0.2.0/24", // Documentation
		"192.88.99.0/24", // Internet. Formerly used for IPv6 to IPv4 relay
		"192.168.0.0/16", // Private network
		"198.18.0.0/15", // Private network
		"198.51.100.0/24", // Documentation
		"203.0.113.0/24", // Documentation
		"224.0.0.0/4", // Internet. In use for multicast
		"233.252.0.0/24", // Documentation
		"240.0.0.0/4", // Internet. Reserved for future use
		"255.255.255.255/32", // Subnet. Reserved for the "limited broadcast" destination address
	],
	fetchAllowIp: true,
	domainBlacklist: ['localhost', /\.local$/],
	domainWhitelist: [/\./],
	// fetchMaxContentLength:  100 /* 100 kB */ * 1000,
	fetchHeaders: {
		"user-agent": "Mozilla/5.0 (compatible; VARHUB-API/1.0)",
	}
})
