import { bindNexusToWebSocket, Nexus } from './core.js'

const nexus = new Nexus({ prefix: 'client:' })

const ws = new WebSocket('ws://localhost:4173/ws')

bindNexusToWebSocket(nexus, ws)

const { promise, resolve } = Promise.withResolvers()

ws.addEventListener('open', resolve)

await promise

console.log('Return', await nexus.simpleCall('basic', 'foo'))

const stream = nexus.streamCall('generate', [ 1, 2, 3 ])

for await (const value of stream) {
  console.log('Value', value)
}

try { await nexus.simpleCall('fail') }
catch (e) { console.log('Error', e) }

try { await nexus.simpleCall('expect barf') }
catch (e) { console.log('Error', e) }

ws.close()
