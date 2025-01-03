import { Nexus } from './nexus.js'

export function startNexus (req, server, handlers, extraArgs) {
  // we *could* create the nexus in the open handler but better to have it
  // created early in case something goes wrong with *that* I think
  let ws
  function setSocket (sock) { ws = sock }
  const nexus = new Nexus({
    prefix: 'server:',
    startCall(call, ...args) {
      let targ = handlers
      try {
        if (Array.isArray(call)) {
          const descend = [ ...call ]
          call = descend.pop()
          targ = descend.reduce((a, b) => a[b], targ)
        }
      } catch (e) {
        throw `Handler lookup failure: ${e}`
      }
      return targ[call](...args)
    },
    sendMessage (...msg) { ws.send(JSON.stringify(msg)) },
    ...extraArgs,
  })
  if (server.upgrade(req, { data: { nexus, setSocket } })) return
  return new Response('This URL is websocket only', { status: 404 })
}

export const websocketHandlers = {
  open (ws) {
    ws.data.setSocket(ws)
    delete ws.data.setSocket
  },
  message (ws, message) {
    ws.data.nexus.receiveMessage(...JSON.parse(message))
  },
}
