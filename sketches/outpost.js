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
import os from 'node:os'

class AttachCommand {

  callHandlers = {
    __proto__: null,
    log (v) { console.error(v); return Promise.resolve(true) }
  }

  constructor (args) {
    Object.assign(this, args)
    this.startCall = this.startCall.bind(this)
  }

  run () {
    const { socketPath, prefix, startCall } = this
    const { stdin, stdout } = process
    if (socketPath === '-') {
      const nexus = nexusFromNDPair(stdin, stdout, { prefix, startCall })
      const { promise, resolve } = Promise.withResolvers()
      nexus.connection.on('close', resolve)
      return promise
    }
    throw 'NYI'
  }

  startCall (callName, ...callArgs) {
    const handler = this.callHandlers[callName]
    if (!handler) return Promise.reject(`No handler for ${callName}`)
    return handler(...callArgs)
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

  const identity = {
    programName, commandName, socketPath, args,
    username: os.userInfo().username,
    hostname: os.hostname(),
    pid: process.pid,
  }

  const prefix = [ 
    [ os.userInfo().username, os.hostname() ].join('@'),
    process.pid, programName, commandName, '',
  ].join(':')

  const command = new subCommands[commandName]({
    socketPath, args
  })

  return command.run()
}

if (import.meta.main) {
  try {
    await main()
  } catch (e) {
    process.stderr.write(e.toString() + "\n")
  }
}
