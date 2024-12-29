const base = { foo () { return 1 } }

const derived = {
  foo () { return super.foo() + 2 }
}

const magic = { foo: derived.foo }

const standalone = magic.foo

Object.setPrototypeOf(derived, base)

console.log(derived.foo()) // 3
console.log(magic.foo())   // also 3
console.log(standalone())  // still 3
