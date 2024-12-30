import { Nexus } from './core.js'

Bun.serve({
  port: 4173,
  fetch (req, server) {
    let path = new URL(req.url).pathname
    if (path == '/ws') {
      const nexus = new Nexus({
        prefix: 'server:',
        startCall (name, ...args) {
          if (name === 'generate') {
            return (async function* () {
              for (const arg of args) {
                yield arg
              }
              return args[0]
            })()
          }
          if (name === 'basic') {
            return Promise.resolve(args)
          }
          if (name === 'fail') {
            return Promise.reject()
          }
          return Promise.reject(`No such CALL ${name}`)
        }
      })
      if (server.upgrade(req, { data: { nexus } })) return
    }
    return new Response('Nope', { status: 404 });
  },
  websocket: {
    open (ws) {
      ws.data.nexus.sendMessage = (...msg) => ws.send(JSON.stringify(msg))
    },
    message (ws, message) {
      ws.data.nexus.receiveMessage(...JSON.parse(message))
    },
  },
});
