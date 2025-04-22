import { Nexus } from './nexus.js'
import * as ndjson from 'ndjson'

export function nexusFromNDSocket (socket, args) {
  return nexusFromNDPair(socket, socket, {
    connection: socket, ...args
  })
}

export function nexusFromNDPair (readable, writable, args) {
  const [ reader, writer ] = [
    readable.pipe(ndjson.parse()),
    ...[ndjson.stringify()].map(w => (w.pipe(writable), w))
  ]
  const nexus = new Nexus({
    sendMessage (...msg) { writer.write(msg) },
    ...args,
  })
  reader.on('data', msg => nexus.receiveMessage(...msg))
  // on error need to tell the other end they screwd up and kill the nexus
  return nexus
}
