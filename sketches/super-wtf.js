const base = { foo () { return 1 } }

const derived = {
  foo () { return super.foo() + 2 }
}

const magic = { foo: derived.foo }

Object.setPrototypeOf(derived, base)

console.log(derived.foo())
console.log(magic.foo())
