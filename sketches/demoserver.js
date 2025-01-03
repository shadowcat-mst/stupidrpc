import { startNexus, websocketHandlers } from '../src/bunserver.js'

const callHandlers = {
  async basic (...args) {
    return args
  },
  async *generate (...args) {
    for (const arg of args) {
      yield arg
    }
    return args.at(-1)
  },
  async fail () { return Promise.reject() },
  nested: [
    null,
    {
      async basic (...args) {
        return args
      },
    },
  ],
}

function startCall (call, ...args) {
  return callHandlers[call](...args)
}

Bun.serve({
  port: 4173,
  fetch (req, server) {
    let path = new URL(req.url).pathname
    if (path == '/ws') {
      return startNexus(req, server, { startCall, debug: console })
    }
  },
  websocket: websocketHandlers,
});
