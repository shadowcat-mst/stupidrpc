// HELO + EHLO handshake TBD

// CAST is an optimisation

// CALL, NEXT, DONE, FAIL are key

// ?plus NOTE for mentioning something non-protocol such as 'reason for close'

// methods, generator or not, are all async

// probably need STOP for subscriptions

const { CALL, NEXT, DONE, FAIL, STOP }
  = new Proxy({}, { get (_, prop) { return prop } })

const AsyncGenerator = (async function* () {})().constructor

class SimpleResultReceiver {

  isComplete = false

  constructor (args) { Object.assign(this, args) }

  complete_ (m, data) {
    if (this.isComplete) return
    this.completions[m](data)
    this.isComplete = true
    this.onComplete()
  }

  NEXT (data) { }
  DONE (data) { this.complete_('resolve', data) }
  FAIL (data) { this.complete_('reject', data) }
}

class StreamResultReceiver {

  elementBuffer = []
  promiseBuffer = []
  isComplete = false

  constructor (args) { Object.assign(this, args) }

  nextPromise () {
    if (this.elementBuffer.length) {
      const el = this.elementBuffer.shift()
      if (el.error) return Promise.reject(el.error)
      return Promise.resolve(el)
    }
    if (this.isComplete) {
      return Promise.resolve({ value: undefined, done: true })
    }
    let completions
    const promise = new Promise((resolve, reject) => {
      completions = { resolve, reject }
    })
    this.promiseBuffer.push(completions)
    return promise
  }

  complete_ () {
    if (this.isComplete) return
    this.isComplete = true
    this.onComplete()
  }

  stop () {
    if (this.isComplete) return
    this.onStop()
    this.complete_()
  }

  NEXT (value) {
    this.next_({ value, done: false })
  }

  DONE (value) {
    this.next_({ value, done: true })
    this.complete_()
  }

  next_ (next) {
    if (this.isComplete) return
    if (this.promiseBuffer.length) {
      this.promiseBuffer.shift().resolve(next)
    } else {
      this.elementBuffer.push(next)
    }
  }

  FAIL (error) {
    if (this.isComplete) return
    if (this.promiseBuffer.length) {
      this.promiseBuffer.shift().reject(error)
    } else {
      this.elementBuffer.push({ error })
    }
    this.complete_()
  }
}

class StreamIterator {

  constructor (args) { Object.assign(this, args) }

  [Symbol.AsyncIterator] () { return this }

  next () { return this.receiver.nextPromise() }

  stop () { this.receiver.stop() }

  return (value) {
    this.receiver.stop()
    return Promise.resolve({ value, done: true })
  }

  throw (error) {
    this.receiver.stop()
    return Promise.reject(error)
  }
}

class CallStopped extends Error {

  constructor () {
    super("StupidRPC: STOP")
  }
}

class SimpleResultSender {

  isComplete = false

  constructor (args) {
    Object.assign(this, args)
    this.state.then(
      this.onDone.bind(this),
      this.onFail.bind(this),
    )
  }

  STOP () {
    if (this.state.cancel) this.state.cancel()
    this.complete_()
  }

  onDone (value) { this.complete_(DONE, value) }
  onFail (value) { this.complete_(FAIL, value) }

  complete_ (type, value) {
    if (this.isComplete) return
    if (type) this.sendMessage(type, value)
    this.isComplete = true
    this.onComplete()
  }
}

class StreamResultSender {

  isComplete = false

  constructor (args) {
    Object.assign(this, args)
    this.doStream()
  }

  async doStream () {
    const { state, sendMessage } = this
    let next, nextResult
    try {
      // can't use a for loop here because we want the { done: true } value
      while (next = state.next()) {
        nextResult = await next
        if (this.isComplete) return
        if (nextResult.done) break
        sendMessage(NEXT, nextResult.value)
      }
      this.complete_(CALL, nextResult.value)
    } catch (error) {
      this.complete_(FAIL, error)
    }
  }

  STOP () {
    // if this aborts the generator as planned JS will rethrow the exception
    // so we do not, in fact, need to care about it, hence 'catch {}'
    try { this.state.throw(new CallStopped()) } catch {}
    this.complete_()
  }

  complete_ (type, value) {
    if (this.isComplete) return
    if (type) this.sendMessage(type, value)
    this.isComplete = true
    this.onComplete()
  }
}

export class Nexus {

  inflight = { __proto__: null }

  idSequence = 0

  nextid () {
    this.idSequence++
    return this.currid()
  }

  currid () {
    let seqstr = this.idSequence.toString()
    if (seqstr.length < 4) {
      const zeroes = new Array(4 - seqstr.length).keys().map(v => '0')
      seqstr = [ ...zeroes, seqstr ].join('')
    }
    return (this.prefix ?? '') + seqstr
  }

  constructor (args) {
    Object.assign(this, args)
  }

  streamCall (call, args) {
    const receiver = this.sendCall_(
      args => new StreamResultReceiver(args),
      call, args,
    )
    return new StreamIterator({ receiver })
  }

  simpleCall (call, args) {
    let completions
    const promise = new Promise((resolve, reject) => {
      completions = { resolve, reject }
    })
    this.sendCall_(
      args => new SimpleResultReceiver({ completions, ...args }),
      call, args,
    )
    return promise
  }

  sendCall_ (makeResultReceiver, call, args) {
    const callId = this.nextid()
    this.sendMessage(CALL, callId, call, args)
    const { inflight } = this
    const receiverArgs = {
      onComplete () { delete inflight[callId] },
      onStop () { this.sendMessage(STOP, callId) },
    }
    return inflight[callId] = makeResultReceiver(receiverArgs)
  }

  receiveMessage (type, callId, ...payload) {
    const { inflight } = this
    if (type === CALL) {
      inflight[callId] = this.receiveCall_(callId, payload)
    } else {
      if (!inflight[callId][type]) {
        throw `No handler for ${type} for ${callid}`
      }
      inflight[callId][type](...payload)
    }
  }

  receiveCall_ (callId, payload) {
    if (!this.startCall) {
      this.sendMessage(FAIL, callId, "CALL unsupported")
      return
    }
    let state
    try {
      state = this.startCall(...payload)
    } catch (error) {
      this.sendMessage(FAIL, callId, error)
      return
    }
    const invalid = () => { throw "onReceiveCall returned invalid type" }
    const resultSenderType = (
      state instanceof Promise
        ? SimpleResultSender
        : state instanceof AsyncGenerator
          ? StreamResultSender
          : invalid()
    )
    const sendMessage = (type, value) => {
      this.sendMessage(type, callId, value)
    }
    const { inflight } = this
    const senderArgs = {
      state, sendMessage,
      onComplete () { delete inflight[callId] },
    }
    inflight[callId] = resultSenderType(senderArgs)
  }
}

export function bindNexusToWebSocket (nexus, ws) {
  nexus.sendMessage = (...msg) => ws.send(JSON.stringify(msg))
  ws.addEventListener(
    'message', ({ data }) => nexus.receiveMessage(...JSON.parse(data))
  )
  return nexus
}
