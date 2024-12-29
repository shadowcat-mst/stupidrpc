const AsyncGenerator = (async function* () {})().constructor

function maybeSetResult (obj, next) {
  if (next.done && !Object.hasOwn(obj, 'result')) {
    obj.result = { value: next.value }
  }
  return next
}

function setError (obj, error) {
  obj.result = { error }
  return error
}

function keepResult (generator) {
  // this will fail if the generator is itself an object literal rather than
  // an instance of a class but I *think* that's acceptable
  const keep = generator instanceof AsyncGenerator
    ? {
      __proto__: Object.getPrototypeOf(generator),
      async next () {
        try {
          return maybeSetResult(this, await super.next())
        } catch (error) {
          throw setError(this, error)
        }
      }
    }
    : {
      __proto__: Object.getPrototypeOf(generator),
      next () {
        try {
          return maybeSetResult(this, super.next())
        } catch (error) {
          throw setError(this, error)
        }
      }
    }
  generator.next = keep.next
  return generator
}
