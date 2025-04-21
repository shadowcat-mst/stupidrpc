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

class CommandBase {

  constructor (args) {
    Object.assign(this, args)
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
}

class AttachCommand extends CommandWithHandlers {

  async run () {
    const { socketPath, prefix, startCall, args } = this
    const plugins = []
    const { onLoaded, onConnected } = pluginSymbols
    for (const filename of args) {
      const { plugin } = await import(filename)
      if (plugin[onLoaded]) plugin[onLoaded](this)
      plugins.push(plugin)
    }
    let nexus
    if (socketPath === '-') {
      const { stdin, stdout } = process
      nexus = nexusFromNDPair(stdin, stdout, { prefix, startCall })
    } else {
      throw 'NYI'
    }
    for (const plugin of plugins) {
      if (plugin[onConnected]) plugin[onConnected](this, nexus)
    }
    return await new Promise(
      resolve => nexus.connection.on('close', resolve)
    )
  }
}

function main () {

  const subCommands = {
    __proto__: null, // no, you're not getting to call toString() or similar
    attach: AttachCommand,
  }

  const [ rawProgramName, commandName, socketPath, ...args ]
    = process.argv.slice(1)

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

if (import.meta.main) {
  try {
    await main()
  } catch (e) {
    // .toString() shows only the error message without the backtrace
    // process.stderr.write(e.toString() + "\n")
    console.error(e)
  }
}
