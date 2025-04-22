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

  result_ = Promise.withResolvers()
  result = this.result_.promise

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
    if (result.error) {
      this.result_.reject(result.error)
    } else {
      this.result_.resolve(result.value)
    }
    if (this.pendingBuffer.length) {
      const [ next, ...rest ] = this.pendingBuffer.splice(0)
      this.completePromise_(next, result)
      rest.forEach(v => v.resolve(COMPLETE_RESULT))
    } else {
      this.resultsBuffer.push(result)
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

class StreamIterator {

  constructor (args) { Object.assign(this, args) }

  get result () { return this.receiver.result }

  [Symbol.asyncIterator] () { return this }

  next () { return this.receiver.nextPromise() }

  // stop() here mirrors SimpleResultReceiver().stop() since that has to
  // do *something* to complete its Promise - but if you want a silent end
  // of streaming you can call .return() so I think that makes sense

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
    const { state } = this
    try {
      // can't use a for loop here because we want the { done: true } value
      let next
      while (true) {
        next = await state.next()
        if (this.isComplete) return
        if (next.done) break
        this.sendMessage(NEXT, next.value)
      }
      this.complete_(DONE, next.value)
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

  inflightMine = new Map()

  inflightTheirs = new Map()

  idSequence = 0

  callHandlers = {}

  nextid_ () {
    let seqstr = (++this.idSequence).toString().padStart(4, '0')
    return (this.prefix ?? '') + seqstr
  }

  constructor (args) {
    Object.assign(this, args)
  }

  call (...call) {
    const { promise, ...completions } = Promise.withResolvers()
    const make = args => new SimpleResultReceiver({ completions, ...args })
    const receiver = this.sendCall_(make, call)
    promise.stop = () => receiver.stop()
    return promise
  }

  iter (...call) {
    const make = args => new StreamResultReceiver(args)
    const receiver = this.sendCall_(make, call)
    return new StreamIterator({ receiver })
  }

  sendCall_ (makeResultReceiver, call) {
    const callId = this.nextid_()
    this.sendMessage_(CALL, callId, ...call)
    const { inflightMine } = this
    const receiverArgs = {
      onComplete () { inflightMine.delete(callId) },
      onStop () { this.sendMessage_(STOP, callId) },
    }
    const receiver = makeResultReceiver(receiverArgs)
    inflightMine.set(callId, receiver)
    return receiver
  }

  sendMessage_ (...msg) {
    if (this.debug?.log) this.debug.log(this.prefix + 'SEND', arguments)
    this.sendMessage(...msg)
  }

  receiveMessage (type, callId, ...payload) {
    if (this.debug?.log) this.debug.log(this.prefix + 'RECV', arguments)
    if (type === CALL) {
      this.receiveCall_(callId, payload)
    } else {
      const inflightEntry = this.inflightMine.get(callId)
      if (!inflightEntry) return
      if (!inflightEntry[type]) {
        throw `No handler for ${type} for ${callId}`
      }
      inflightEntry[type](...payload)
    }
  }

  receiveCall_ (callId, payload) {
    function invalid () { throw "startCall returned invalid type" }
    let state, resultSenderType
    try {
      state = this.startCall(...payload) ?? invalid()
      resultSenderType = (
        state['then']
          ? SimpleResultSender
          : state[Symbol.asyncIterator]
            ? StreamResultSender
            : invalid()
      )
    } catch (error) {
      this.sendMessage_(FAIL, callId, error.toString())
      return
    }
    const sendMessage = (type, value) => this.sendMessage_(type, callId, value)
    const { inflightTheirs } = this
    const senderArgs = {
      state, sendMessage,
      onComplete () { inflightTheirs.delete(callId) },
    }
    const sender = new resultSenderType(senderArgs)
    inflightTheirs.set(callId, sender)
    return sender
  }

  startCall(name, ...args) {
    const { callHandlers } = this
    if (!callHandlers?.[name]) {
      throw `CALL ${name} unsupported by this endpoint`
    }
    return callHandlers[name](...args)
  }
}
