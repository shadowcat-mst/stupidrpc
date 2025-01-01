import { Nexus } from './nexus.js'

function bindNexusToWebSocket (nexus, ws) {
  nexus.sendMessage = (...msg) => ws.send(JSON.stringify(msg))
  ws.addEventListener(
    'message', ({ data }) => nexus.receiveMessage(...JSON.parse(data))
  )
  nexus.ws = ws
  return nexus
}

function wsConnect (ws) {
  if (typeof ws === 'string') ws = new WebSocket(ws)
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

export async function nexusFromWebSocket (ws, nexusArgs) {
  return bindNexusToWebSocket(new Nexus(nexusArgs), await wsConnect(ws))
}
