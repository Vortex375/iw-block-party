/* Serial Port Interface to Light Control Arduino Device */

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

const log = logging.getLogger("BlockPartySource")

const SERVICE_TYPE = "block-party-source"
const GST_HELPER_COMMAND_DEFAULT = "iw-gst-helper"
const PA_HELPER_COMMAND_DEFAULT = "iw-pa-helper"
/* wait 5 seconds before sending sigkill to helpers */
const HELPER_KILL_TIMEOUT = 5000
const RETRY_TIMEOUT = 5000


export interface BlockPartySourceConfig {
  dsPath: string,
  gstHelper?: string,
  paHelper?: string,
  address: string,
  rtpPort: number,
  rtcpPort: number
}

export class BlockPartySource extends Service {

  private paHelper: ChildProcess
  private gstHelper: ChildProcess
  private config: BlockPartySourceConfig
  private streamActive: boolean
  private lastMessage: string

  constructor(private readonly ds: DeepstreamClient) {
    super(SERVICE_TYPE)

    process.on("exit", () => this.killHelpers())
  }

  start(config: BlockPartySourceConfig) {
    this.config = config

    process.nextTick(() => this.spawnHelper())

    return Promise.resolve()
  }

  stop() {
    this.stopStream()
    this.killHelpers()

    return Promise.resolve()
  }

  private startStream() {
    if (this.streamActive) {
      this.stopStream()
    }

    this.setState(State.BUSY, "starting stream ...")

    if ( ! this.paHelper) {
      /* helper death ? */
      log.error("wanted to start stream but pa helper has died")
      return
    }

    this.paHelper.stdin.write("start-stream\n")

    const helperCmd = this.config.gstHelper || GST_HELPER_COMMAND_DEFAULT
    const args = ["-s", this.config.address, "" + this.config.rtpPort, "" + this.config.rtcpPort]
    log.info({args: args}, "spawning %s", helperCmd)
    try {
      this.gstHelper = spawn(helperCmd, args)
      this.gstHelper.stdout.on("data", (data) => {
        const str = data.toString()
        log.debug({sub: helperCmd}, str)

        if (str.startsWith("stream-meta")) {
          let props = str.slice(12).trim() /* cut off "stream-meta " */
          this.publishStream(props)
          this.setState(State.OK, "stream active")
        }

        
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

    this.streamActive = true
  }

  private stopStream() {
    if ( ! this.streamActive) {
      return
    }

    if ( ! this.paHelper) {
      log.error("wanted to stop stream but pa helper has died")
    } else {
      this.paHelper.stdin.write("stop-stream\n")
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

  private publishStream(parameters: string) {
    const props: StreamProperties = {
      address: this.config.address,
      rtpPort: this.config.rtpPort,
      rtcpPort: this.config.rtcpPort,
      parameters:  parameters
    }

    const record = this.ds.getRecord(this.config.dsPath)
    record.whenReady(() => {
      record.set(props)
      record.discard()
    })
    log.info({props: props}, "published stream properties")
  }

  private spawnHelper() {
    const helperCmd = this.config.paHelper || PA_HELPER_COMMAND_DEFAULT
    log.info("spawning %s", helperCmd)
    
    try {
      this.paHelper = spawn(helperCmd)
      this.paHelper.stdout.on("data", (data) => {
        const str = data.toString()
        log.debug({sub: helperCmd}, str)
        this.lastMessage = str
      })
      this.paHelper.stderr.on("data", (data) => {
        const msgs = data.toString().split("\n")
        for (let msg of msgs) {
          msg = msg.trim()
          if (msg == "") continue
          log.debug({sub: helperCmd + " (stderr)"}, msg)
          this.lastMessage = msg
        }
      })
      this.paHelper.on("close", (code) => this.handlePaHelperExit(code))
      this.paHelper.on("error", (err) => {
        this.paHelper = null
        this.setState(State.ERROR, "unable to spawn pa helper")
        this.setErrorDiagnostic(err)
      })
    } catch (err) {
      this.paHelper = null
      this.setState(State.ERROR, "unable to spawn pa helper")
      this.setErrorDiagnostic(err)
      return
    }

    this.setState(State.BUSY, "about to start stream ...")
    setTimeout(() => this.startStream(), 1000) /* allow pa helper to start up and intitialize */
  }

  private handlePaHelperExit(code: number) {
    this.paHelper = null
    log.debug({sub: this.config.paHelper || PA_HELPER_COMMAND_DEFAULT, code: code}, "finished with exit code %d", code)
    
    switch(code) {
      case 0:
        this.setState(State.INACTIVE)
        break
      case 1:
        this.setState(State.ERROR, this.lastMessage)
        break
      case 2:
        this.setState(State.PROBLEM, "Connection to pulseaudio lost. Retrying...")
        setTimeout(() => this.spawnHelper(), RETRY_TIMEOUT)
        break
      default:
        this.setState(State.ERROR, "pa helper process died unexpectedly " + code)
    }
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
    if (this.paHelper) {
      this.paHelper.kill("SIGINT")
    }
    if (this.gstHelper) {
      this.gstHelper.kill("SIGINT")
    }
  }
}