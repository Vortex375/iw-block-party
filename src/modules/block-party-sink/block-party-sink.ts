/* BlockParty Audio Sink (Playback) */

/// <reference types="deepstream.io-client-js" />

import * as logging from "iw-base/dist/lib/logging"
import { Service, State } from "iw-base/dist/lib/registry"
import { DeepstreamClient } from "iw-base/dist/modules/deepstream-client"
import { StreamProperties } from "../../lib/block-party-shared"

import * as _ from "lodash"

import util = require("util")
import process = require("process")
import childProcess = require("child_process")
import ChildProcess = childProcess.ChildProcess
import spawn = childProcess.spawn

const log = logging.getLogger("BlockPartySink")

const SERVICE_TYPE = "block-party-sink"
const GST_HELPER_COMMAND_DEFAULT = "iw-gst-helper"
/* wait 5 seconds before sending sigkill to helpers */
const HELPER_KILL_TIMEOUT = 5000
const RETRY_TIMEOUT = 5000

export interface BlockPartySinkConfig {
  dsPath: string,
  gstHelper?: string
}

export class BlockPartySink extends Service {

  private gstHelper: ChildProcess
  private config: BlockPartySinkConfig
  private streamProperties: StreamProperties
  private streamActive: boolean
  private lastMessage: string
  private subscription: any

  constructor(private readonly ds: DeepstreamClient) {
    super(SERVICE_TYPE)

    process.on("exit", () => this.killHelpers())
  }

  start(config: BlockPartySinkConfig) {
    this.config = config
    this.subscription = (data) => this.updateStream(data)
    this.ds.subscribe(config.dsPath, this.subscription, undefined, true)

    return Promise.resolve()
  }

  stop() {
    this.ds.unsubscribe(this.config.dsPath, this.subscription)
    this.stopStream()

    return Promise.resolve()
  }

  private startStream() {
    if (this.streamActive) {
      this.stopStream()
    }

    if ( ! this.streamProperties || ! this.streamProperties.address) {
      log.error("wanted to start stream but have no valid properties")
      return
    }

    this.setState(State.BUSY, "starting stream ...")

    const helperCmd = this.config.gstHelper || GST_HELPER_COMMAND_DEFAULT
    const args = ["-r", this.streamProperties.address, "" + this.streamProperties.rtpPort, "" + this.streamProperties.rtcpPort, this.streamProperties.parameters]
    log.info({args: args}, "spawning %s", helperCmd)
    try {
      this.gstHelper = spawn(helperCmd, args)
      this.gstHelper.stdout.on("data", (data) => {
        const str = data.toString()
        log.debug({sub: helperCmd}, str)
        this.lastMessage = str
      })
      this.gstHelper.stderr.on("data", (data) => {
        const msgs = data.toString().split("\n")
        for (let msg of msgs) {
          msg = msg.trim()
          if (msg == "") continue
          log.debug({sub: helperCmd + " (stderr)"}, msg)
          this.lastMessage = msg
        }
      })
      this.gstHelper.on("close", (code) => this.handleGstHelperExit(code))
      this.gstHelper.on("error", (err) => {
        this.gstHelper = null
        this.setState(State.ERROR, "unable to spawn gst helper")
        this.setErrorDiagnostic(err)
      })
    } catch (err) {
      this.gstHelper = null
      this.setState(State.ERROR, "unable to spawn gst helper")
      this.setErrorDiagnostic(err)
      return
    }

    this.setState(State.OK, `streaming from ${this.streamProperties.address}:${this.streamProperties.rtpPort} (RTP/UDP)`)
    this.streamActive = true
  }

  private stopStream() {
    if ( ! this.streamActive) {
      return
    }

    if ( ! this.gstHelper) {
      log.error("wanted to stop stream but gst helper has died")
    } else {
      const helper = this.gstHelper
      this.gstHelper = null
      
      helper.removeAllListeners()
      
      let killTimeout = setTimeout(() => {
        helper.kill("SIGKILL")
        killTimeout = undefined
      }, HELPER_KILL_TIMEOUT)
      
      helper.once("close", () => {
        if (killTimeout) {
          clearTimeout(killTimeout)
          killTimeout = undefined
        }
      })

      helper.kill("SIGINT")
    }

    this.streamActive = false
    this.setState(State.INACTIVE, "stream stopped")
  }

  private updateStream(data) {
    this.streamProperties = <StreamProperties> data
    this.startStream()
  }

  private handleGstHelperExit(code: number) {
    this.gstHelper = null
    log.debug({sub: this.config.gstHelper || GST_HELPER_COMMAND_DEFAULT, code: code}, "finished with exit code %d", code)

    switch (code) {
      case 0:
        this.setState(State.INACTIVE, "stream stopped")
        break
      case 1:
        this.setState(State.ERROR, this.lastMessage)
        break
      case 2:
        this.setState(State.PROBLEM, "Streaming process interrupted. Check log for details. Retrying...")
        setTimeout(() => this.startStream(), RETRY_TIMEOUT)
        break
      default:
        this.setState(State.ERROR, "gst helper process died unexpectedly " + code)
    }
  }

  private killHelpers() {
    log.debug("cleaning up helper programs")
    if (this.gstHelper) {
      this.gstHelper.kill("SIGINT")
    }
  }
}