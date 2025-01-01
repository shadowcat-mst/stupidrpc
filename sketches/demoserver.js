import { Nexus } from '../src/nexus.js'

const callHandlers = {
  async basic (...args) {
    return Promise.resolve(args)
  },
  async *generate (...args) {
    for (const arg of args) {
      yield arg
    }
    return args.at(-1)
  },
  async fail () { return Promise.reject() },
}

Bun.serve({
  port: 4173,
  fetch (req, server) {
    let path = new URL(req.url).pathname
    if (path == '/ws') {
      const nexus = new Nexus({
        prefix: 'server:',
        startCall (name, ...args) {
          if (callHandlers[name]) {
            return callHandlers[name](...args)
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
