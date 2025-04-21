/*

CLI:

outpost call /path/to/socket command goes here
outpost cast /path/to/socket command goes here

outpost attach /path/to/socket <files> # connect and wait for commands
outpost listen /path/to/socket <files> # listen and wait for connections

if path is host:/some/path or user@host:/some/path do so over ssh

attach allows a path of '-' to bind to stdin/stdout for debugging

<files> is .js/.ts/etc. files that provide a `commands` export with additional
commands to register to the outpost (`say` and `log` are built-ins at least
for the moment)

*/

import { nexusFromNDSocket, nexusFromNDPair } from '../src/ndsocket.js'
import { pluginSymbols } from './outpost-plugin.js'
import os from 'node:os'
import net from 'node:net'

class CommandBase {

  constructor (args) {
    Object.assign(this, args)
  }

  async makeNexus (socket) {
    const { socketPath, prefix, startCall } = this
    let nexus
    if (socket) {
      nexus = nexusFromNDSocket(socket, { prefix, startCall })
    } else if (socketPath === '-') {
      const { stdin, stdout } = process
      nexus = nexusFromNDPair(stdin, stdout, { prefix, startCall })
    } else {
      const { promise, resolve, reject } = Promise.withResolvers()
      socket = net.createConnection(socketPath, resolve)
      socket.on('error', reject)
      await promise
      nexus = nexusFromNDSocket(socket, { prefix, startCall })
    }
    return nexus
  }
}

class CommandWithHandlers extends CommandBase {

  callHandlers = {
    __proto__: null,
    log (v) { console.error(v); return Promise.resolve(true) },
    echo (v) { return Promise.resolve(v) },
  }

  constructor (args) {
    super(args)
    this.startCall = this.startCall.bind(this)
  }

  startCall (callName, ...callArgs) {
    const handler = this.callHandlers[callName]
    if (!handler) return Promise.reject(`No handler for ${callName}`)
    return handler(...callArgs)
  }

  async makeNexus (...args) {
    const nexus = await super.makeNexus(...args)
    await this.notifyPlugins(nexus)
    return nexus
  }

  async loadPlugins () {
    if (this.plugins) return
    const { onLoaded } = pluginSymbols
    const plugins = []
    for (const filename of this.args) {
      const { plugin } = await import(filename)
      if (plugin[onLoaded]) plugin[onLoaded](this)
      plugins.push(plugin)
    }
    this.plugins = plugins
  }

  async notifyPlugins (nexus) {
    const { onConnected } = pluginSymbols
    for (const plugin of this.plugins) {
      if (plugin[onConnected]) await plugin[onConnected](this, nexus)
    }
  }
}

class AttachCommand extends CommandWithHandlers {

  async run () {
    await this.loadPlugins()
    const nexus = await this.makeNexus()
    return await new Promise(
      resolve => nexus.connection.on('close', resolve)
    )
  }
}

class ListenCommand extends CommandWithHandlers {

  // have to audit this for memory leaks later
  // also some sort of sane shutdown when the client goes away
  // but to begin with, let's settle for it working at all

  async run () {
    await this.loadPlugins()

    const server = net.createServer(c => this.setupConnection(c))

    await this.listen(server)

    return new Promise(() => {}) // dummy forever promise, fix later
  }

  listen (server) {
    const { promise, resolve, reject } = Promise.withResolvers()

    server.on('error', reject)

    server.listen(this.socketPath, resolve)

    return promise
  }

  async setupConnection (client) {
    const nexus = await this.makeNexus(client)
  }
}

class CallCommand extends CommandBase {

  async run () {
    const nexus = await this.makeNexus()
    const payload = this.args.map(v =>
      v.match(/^["{\[0-9]/) ? JSON.parse(v) : v
    )
    const result = await nexus.call(...payload)
    console.error(result)
    nexus.connection.destroy()
    return true
  }
}

class Outpost {

  constructor (args) {
    Object.assign(this, args)
  }

  run () {

    const subCommands = {
      __proto__: null, // no, you're not getting to call toString() or similar
      attach: AttachCommand,
      call: CallCommand,
      listen: ListenCommand,
    }

    const [ rawProgramName, commandName, socketPath, ...args ]
      = this.argv.slice(1)

    const programName = rawProgramName.replace(/^.*\//,'').replace(/\..*$/,'')

    if (!commandName || !socketPath) {
      throw `Usage: ${programName} commandName socketPath ...args`
    }

    if (!subCommands[commandName]) {
      const validCommands = Object.keys(subCommands).toSorted().join(', ')
      throw `No such subcommand ${commandName}, try one of: ${validCommands}`
    }

    const prefix = [ 
      [ os.userInfo().username, os.hostname() ].join('@'),
      process.pid, programName, commandName, '',
    ].join(':')

    const command = new subCommands[commandName]({
      programName, commandName, socketPath, args, prefix
    })

    return command.run()
  }
}

if (import.meta.main) {
  try {
    const { argv } = process
    await new Outpost({ argv }).run()
  } catch (e) {
    // .toString() shows only the error message without the backtrace
    // process.stderr.write(e.toString() + "\n")
    console.error(e)
  }
}
