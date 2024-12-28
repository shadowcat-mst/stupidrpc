import { Nexus } from './core.js'

const clientSent = []

const clientNexus = new Nexus({
  prefix: 'client:',
  sendMessage (...msg) {
    console.log(`${this.prefix}SEND`, JSON.stringify(msg))
    clientSent.push(msg)
  },
  receiveMessage (...msg) {
    console.log(`${this.prefix}RECV`, JSON.stringify(msg))
    Nexus.prototype.receiveMessage.apply(this, msg)
  }
})

const p0 = clientNexus.simpleCall('foo', [])

clientNexus.receiveMessage('DONE', 'client:0001', 'bar')

const p0r = await p0

console.log('Resolve', p0r)
