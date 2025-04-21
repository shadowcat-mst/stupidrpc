import os from 'node:os'
import { pluginSymbols } from '../outpost-plugin.js'

const staticIdentity = {
  tags: new URL(import.meta.url).searchParams.getAll('tag'),
  username: os.userInfo().username,
  hostname: os.hostname(),
  pid: process.pid,
}

export const plugin = {
  [pluginSymbols.onConnected] (command, nexus) {
    const { programName, commandName, socketPath, args } = command

    const identity = {
      programName, commandName, socketPath, args,
      ...staticIdentity,
    }

    // currently ignoring the result because it either works or it doesn't
    // and the outpost should be able to continue to work in either case
    nexus.call('setConnectionIdentity', identity)
  }
}
