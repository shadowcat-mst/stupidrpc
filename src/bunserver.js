import { Nexus } from './nexus.js'

export function startNexus (req, server, handlers) {
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
    }
  })
  if (server.upgrade(req, { data: { nexus } })) return
  return new Response('This URL is websocket only', { status: 404 })
}

export const websocketHandlers = {
  open (ws) {
    ws.data.nexus.sendMessage = (...msg) => ws.send(JSON.stringify(msg))
  },
  message (ws, message) {
    ws.data.nexus.receiveMessage(...JSON.parse(message))
  },
}
