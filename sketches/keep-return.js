const AsyncGenerator = (async function* () {})().constructor

function keepResult (generator) {
  // this will fail if the generator is itself an object literal rather than
  // an instance of a class but I *think* that's acceptable
  const keep = generator instanceof AsyncGenerator
    ? {
      __proto__: Object.getPrototypeOf(generator),
      async next () {
        try {
          const next = await super.next()
          if (next.done && !Object.hasOwn('result')) {
            this.result = { value }
          }
          return value
        } catch (error) {
          this.result = { error }
          throw error
        }
      }
    }
    : {
      __proto__: Object.getPrototypeOf(generator),
      next () {
        try {
          const next = super.next()
          if (next.done && !Object.hasOwn('result')) {
            this.result = { value }
          }
          return value
        } catch (error) {
          this.result = { error }
          throw error
        }
      }
    }
  generator.next = keep.next
  return generator
}
