// HELO + EHLO handshake TBD

// CAST is an optimisation

// CALL, NEXT, DONE, FAIL are key

// ?plus NOTE for mentioning something non-protocol such as 'reason for close'

// methods, generator or not, are all async

// probably need STOP for subscriptions

const { CALL, NEXT, DONE, FAIL, STOP }
  = new Proxy({}, { get (_, prop) { return prop } })

class CallStopped extends Error {

  constructor () {
    super("StupidRPC: STOP")
  }
}

class SimpleResultReceiver {

  isComplete = false

  constructor (args) { Object.assign(this, args) }

  complete_ (m, data) {
    if (this.isComplete) return
    this.completions[m](data)
    this.isComplete = true
    this.onComplete()
  }

  stop () {
    this.onStop()
    this.complete_('reject', new CallStopped())
  }

  NEXT (data) { }
  DONE (data) { this.complete_('resolve', data) }
  FAIL (data) { this.complete_('reject', data) }
}

const COMPLETE_RESULT = { value: undefined, done: true }

class StreamResultReceiver {

  resultsBuffer = []
  pendingBuffer = []
  isComplete = false

  constructor (args) { Object.assign(this, args) }

  completePromise_ (promise, result) {
    if (result.error) {
      return promise.reject(result.error)
    }
    return promise.resolve(result)
  }

  push_ (result) {
    if (this.isComplete) return
    if (this.pendingBuffer.length) {
      this.pendingBuffer.shift().resolve(result)
    } else {
      this.resultsBuffer.push(result)
    }
  }

  complete_ (result) {
    if (this.isComplete) return
    this.isComplete = true
    if (result) {
      if (this.pendingBuffer.length) {
        const [ next, ...rest ] = this.pendingBuffer.splice(0)
        this.completePromise_(next, result)
        rest.forEach(v => v.resolve(COMPLETE_RESULT))
      } else {
        this.resultsBuffer.push(result)
      }
    }
    this.onComplete()
  }

  nextPromise () {
    if (this.resultsBuffer.length) {
      return this.completePromise_(Promise, this.resultsBuffer.shift())
    }
    if (this.isComplete) return Promise.resolve(COMPLETE_RESULT)
    const { promise, ...completions } = Promise.withResolvers()
    this.pendingBuffer.push(completions)
    return promise
  }

  stop (result) {
    if (this.isComplete) return
    this.onStop()
    this.complete_(result)
  }

  NEXT (value) {
    this.push_({ value, done: false })
  }

  DONE (value) {
    this.complete_({ value, done: true })
  }

  FAIL (error) {
    this.complete_({ error })
  }
}

class StreamGenerator {

  constructor (args) { Object.assign(this, args) }

  [Symbol.AsyncIterator] () { return this }

  next () { return this.receiver.nextPromise() }

  stop () {
    this.receiver.stop({ error: new CallStopped() })
  }

  // I think this is sensible behaviour for these two
  // but testing against AsyncGenerator instances later may be wise

  return (value) {
    this.receiver.stop({ value, done: true })
    return Promise.resolve({ value, done: true })
  }

  throw (error) {
    this.receiver.stop({ error })
    return Promise.reject(error)
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
    try {
      // can't use a for loop here because we want the { done: true } value
      let next
      while (true) {
        next = await state.next()
        if (this.isComplete) return
        if (next.done) break
        sendMessage(NEXT, next.value)
      }
      this.complete_(CALL, next.value)
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
    return new StreamGenerator({ receiver })
  }

  simpleCall (call, args) {
    const { promise, ...completions } = Promise.withResolvers()
    const receiver = this.sendCall_(
      args => new SimpleResultReceiver({ completions, ...args }),
      call, args,
    )
    promise.stop = () => receiver.stop()
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
      this.sendMessage(FAIL, callId, "CALL unsupported by this endpoint")
      return
    }
    let state
    try {
      state = this.startCall(...payload)
    } catch (error) {
      this.sendMessage(FAIL, callId, error)
      return
    }
    const invalid = () => { throw "startCall returned invalid type" }
    const resultSenderType = (
      state instanceof Promise
        ? SimpleResultSender
        : state[Symbol.asyncIterator]
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
    inflight[callId] = new resultSenderType(senderArgs)
  }
}

export function bindNexusToWebSocket (nexus, ws) {
  nexus.sendMessage = (...msg) => ws.send(JSON.stringify(msg))
  ws.addEventListener(
    'message', ({ data }) => nexus.receiveMessage(...JSON.parse(data))
  )
  return nexus
}
