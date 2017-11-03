/* Serial Port Interface to Light Control Arduino Device */

/// <reference types="deepstream.io-client-js" />

import * as logging from "iw-base/dist/lib/logging"
import { Service, State } from "iw-base/dist/lib/registry"
import { DeepstreamClient } from "iw-base/dist/modules/deepstream-client"

import * as _ from "lodash"

import util = require("util")
import process = require("process")
import childProcess = require("child_process")
import ChildProcess = childProcess.ChildProcess
import spawn = childProcess.spawn

const log = logging.getLogger("BlockPartySink")

const SERVICE_TYPE = "block-party-sink"
const GST_HELPER_COMMAND_DEFAULT = "iw-gst-helper"
const PA_HELPER_COMMAND_DEFAULT = "iw-pa-helper"


export interface BlockPartySinkConfig {
  dsPath: string,
  gstHelper?: string
}

export class BlockPartySink  {

}