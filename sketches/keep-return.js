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

function keepResult (iterator) {
  // this will fail if the iterator is itself an object literal rather than
  // an instance of a class but I *think* that's acceptable
  const keep = iterator[Symbol.asyncIterator]
    ? {
      __proto__: Object.getPrototypeOf(iterator),
      async next () {
        try {
          return maybeSetResult(this, await super.next())
        } catch (error) {
          throw setError(this, error)
        }
      }
    }
    : {
      __proto__: Object.getPrototypeOf(iterator),
      next () {
        try {
          return maybeSetResult(this, super.next())
        } catch (error) {
          throw setError(this, error)
        }
      }
    }
  iterator.next = keep.next
  return iterator
}
