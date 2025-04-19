import net from 'node:net'
import * as ndjson from 'ndjson'
import { Transform } from 'node:stream'

function ndpair (socket) {
  return [
    socket.pipe(ndjson.parse()),
    ...[ndjson.stringify()].map(w => (w.pipe(socket), w))
  ]
}


const server = net.createServer((c) => {

  // 'connection' listener.

  console.log('client connected');

  c.on('end', () => {

    console.log('client disconnected');

  });

  const [ reader, writer ] = ndpair(c)

  writer.write([{count: 0}])

  const counter = (() => {
    let count = 0
    return new Transform({
      objectMode: true,
      transform (obj, _, cb) {
        ++count
        cb(null, [ { count }, ...obj ])
      }
    })
  })()

  reader.pipe(counter).pipe(writer)

});

server.on('error', (err) => {

  throw err;

});

server.listen('/tmp/echo.sock', () => {

  console.log('server bound');

});
