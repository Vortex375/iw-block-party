/* BlockParty script */

import { BlockPartySource } from "./modules/block-party-source"
import { BlockPartySink } from "./modules/block-party-sink"
import { DeepstreamClient } from "iw-base/dist/modules/deepstream-client"
import { UdpDiscovery } from "iw-base/dist/modules/udp-discovery"

import minimist = require("minimist")

const MULTICAST_GROUP_DEFAULT = "224.0.0.150"
const RTP_PORT_DEFAULT = 55000
const RTCP_PORT_DEFAULT = 56000

const argv = minimist(process.argv.slice(2))

const client = new DeepstreamClient()
const discovery = new UdpDiscovery(client)
discovery.start()

if (argv._.length < 1) {
  argv._.push(MULTICAST_GROUP_DEFAULT)
}
if (argv._.length < 2) {
  argv._.push("" + RTP_PORT_DEFAULT)
}
if (argv._.length < 3) {
  argv._.push("" + RTCP_PORT_DEFAULT)
}

if (argv["source"]) {
  const source = new BlockPartySource(client)

  client.on("connected", () => source.start({
    dsPath: argv["source"],
    address: argv._[0],
    rtpPort: parseInt(argv._[1]),
    rtcpPort: parseInt(argv._[2])
  }))
  client.on("disconnected", () => source.stop())

  discovery.start()
  
} else if (argv["sink"]) {
  const sink = new BlockPartySink(client)
  
    client.on("connected", () => sink.start({
      dsPath: argv["sink"]
    }))
    client.on("disconnected", () => sink.stop())

    discovery.start({
      broadcastPort: argv["local"] ? 6032 : undefined
    })
} else {
  console.log("Please give either --source or --sink option")
  process.exit(1)
}
