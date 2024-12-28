import { Nexus } from './core.js'

const clientSent = []

const clientNexus = new Nexus({
  __proto__: Nexus.prototype,
  prefix: 'client:',
  sendMessage (...msg) {
    console.log(`${this.prefix}SEND`, JSON.stringify(msg))
    clientSent.push(msg)
  },
  receiveMessage (...msg) {
    console.log(`${this.prefix}RECV`, JSON.stringify(msg))
    super.receiveMessage.apply(this, msg)
  }
})

const p0 = clientNexus.simpleCall('foo', [])

clientNexus.receiveMessage('DONE', 'client:0001', 'bar')

const p0r = await p0

console.log('Resolve', p0r)

const g0 = clientNexus.streamCall('genFoo', [])

clientNexus.receiveMessage('NEXT', 'client:0002', 'meep1')

const p1r = await g0.next()

console.log('Resolve', p1r)

const p2 = g0.next()

clientNexus.receiveMessage('NEXT', 'client:0002', 'meep2')

const p2r = await p2

console.log('Resolve', p2r)

clientNexus.receiveMessage('DONE', 'client:0002', 'meep3')

const p3r = await g0.next()

console.log('Resolve', p3r)

const p4r = await g0.next()

console.log('Resolve', p4r)
