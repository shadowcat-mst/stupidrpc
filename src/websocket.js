import { Nexus } from './nexus.js'

function wsConnect (ws) {
  if (typeof ws === 'string') ws = new WebSocket(ws)
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve(ws)
  if (ws.readyState !== WebSocket.CONNECTING) {
    return Promise.reject("WebSocket neither OPEN nor CONNECTING")
  }
  const { promise, resolve, reject } = Promise.withResolvers()
  function updateEvents (ws, updateType) {
    ws[`${updateType}EventListener`]('open', onOpen)
    ws[`${updateType}EventListener`]('close', onClose)
  }
  function onOpen () {
    resolve(ws)
    updateEvents(ws, 'remove')
  }
  function onClose ({ reason }) {
    reject(reason)
    updateEvents(ws, 'remove')
  }
  updateEvents(ws, 'add')
  return promise
}

export async function nexusFromWebSocket (ws, args) {
  ws = await wsConnect(ws)
  const nexus = new Nexus({
    sendMessage (...msg) { ws.send(JSON.stringify(msg)) },
    ws,
    ...args,
  })
  ws.addEventListener(
    'message', ({ data }) => nexus.receiveMessage(...JSON.parse(data))
  )
  return nexus
}
