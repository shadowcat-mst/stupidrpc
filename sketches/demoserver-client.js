import { nexusFromWebSocket } from '../src/websocket.js'

let ws

const nexus = await nexusFromWebSocket(
  ws = new WebSocket('ws://localhost:4173/ws'),
  { prefix: 'client:' }
)

console.log('Return', await nexus.call('basic', 'foo'))

console.log('Return', await nexus.call([ 'nested', 1, 'basic' ], 'foo'))

const stream = nexus.iter('generate', 1, 2, 3)

for await (const value of stream) {
  console.log('Value', value)
}

console.log('Return', await stream.result)

try { await nexus.call('fail') }
catch (e) { console.log('Error', e) }

try { await nexus.call('expect barf') }
catch (e) { console.log('Error', e) }

console.log('Return', await nexus.call('generate', 'bar'))

ws.close()
