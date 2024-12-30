import { bindNexusToWebSocket, Nexus } from './core.js'

const nexus = new Nexus({ prefix: 'client:' })

const ws = new WebSocket('ws://localhost:4173/ws')

bindNexusToWebSocket(nexus, ws)

const { promise, resolve } = Promise.withResolvers()

ws.addEventListener('open', resolve)

await promise

console.log('Return', await nexus.call('basic', 'foo'))

const stream = nexus.iter('generate', 1, 2, 3)

for await (const value of stream) {
  console.log('Value', value)
}

try { await nexus.call('fail') }
catch (e) { console.log('Error', e) }

try { await nexus.call('expect barf') }
catch (e) { console.log('Error', e) }

ws.close()
