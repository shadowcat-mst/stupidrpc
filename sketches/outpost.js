/*

CLI:

outpost call /path/to/socket command goes here
outpost cast /path/to/socket command goes here

outpost attach /path/to/socket <files> # connect and wait for commands
outpost listen /path/to/socket <files> # listen and wait for connections

if path is host:/some/path or user@host:/some/path do so over ssh

<files> is .js/.ts/etc. files that provide a `commands` export with additional
commands to register to the outpost (`say` and `log` are built-ins at least
for the moment)

*/

import { nexusFromNDSocket } from '../src/ndsocket.js'
import os from 'node:os'

const [ rawProgramName, commandName, socketPath, ...args ]
   = process.argv.slice(1)

const programName = rawProgramName.replace(/^.*\//,'').replace(/\..*$/,'')

if (!commandName || !socketPath) {
  throw "Usage fail"
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

const setupNexus = socket => nexusFromNDSocket(socket, { prefix })
