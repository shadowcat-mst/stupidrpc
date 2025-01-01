import { nexusFromWebSocket } from '../src/websocket.js'

const nexus = await nexusFromWebSocket(
  'ws://localhost:4173/ws',
  { prefix: 'client:' }
)

console.log('Return', await nexus.call('basic', 'foo'))

const stream = nexus.iter('generate', 1, 2, 3)

for await (const value of stream) {
  console.log('Value', value)
}

try { await nexus.call('fail') }
catch (e) { console.log('Error', e) }

try { await nexus.call('expect barf') }
catch (e) { console.log('Error', e) }

console.log('Return', await nexus.call('generate', 'bar'))

nexus.ws.close()
