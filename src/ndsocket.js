import { Nexus } from './nexus.js'
import * as ndjson from 'ndjson'

function ndpair (socket) {
  return [
    socket.pipe(ndjson.parse()),
    ...[ndjson.stringify()].map(w => (w.pipe(socket), w))
  ]
}

export function nexusFromNDSocket (socket, args) {
  const [ reader, writer ] = ndpair(socket)
  const nexus = new Nexus({
    sendMessage (...msg) { writer.write(msg) },
    connection: socket,
    ...args,
  })
  reader.on('data', msg => nexus.receiveMessage(...msg))
  // on error need to tell the other end they screwd up and kill the nexus
  return nexus
}
