import { Nexus } from '../src/nexus.js'

function loggedNexus (nexusArgs) {
  return new Nexus({
    debug: console,
    ...nexusArgs,
  })
}

let clientSend = () => {}

const clientNexus = loggedNexus({
   prefix: 'client:',
   sendMessage (...msg) { clientSend(msg) },
})

const p0 = clientNexus.call('foo', [])

clientNexus.receiveMessage('DONE', 'client:0001', 'bar')

const p0r = await p0

console.log('Resolve', p0r)

const g0 = clientNexus.iter('genFoo', [])

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

const doneHandlers = {}, callHandlers = {
  async foo () { return 'bar' },
  async *fooGen () {
    yield 'meep1'
    yield 'meep2'
    return 'meep3'
  },
}

let serverSend = ([ type, callId, value ]) => {
  if (type === 'DONE' || type === 'FAIL') {
    const cb = doneHandlers[callId]
    if (cb) cb([ type, value ])
  }
}

const serverNexus = loggedNexus({
  prefix: 'server:',
  startCall (methodName) { return callHandlers[methodName]() },
  sendMessage(...msg) { serverSend(msg) },
})

const p5 = new Promise(resolve => doneHandlers['inject:0001'] = resolve)

serverNexus.receiveMessage('CALL', 'inject:0001', 'foo')

console.log('Resolve', await p5)

const p6 = new Promise(resolve => doneHandlers['inject:0002'] = resolve)

serverNexus.receiveMessage('CALL', 'inject:0002', 'fooGen')

console.log('Resolve', await p6)
