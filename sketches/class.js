export const ClassSymbol = {
  has: Symbol('ClassSymbol.has'),
}

function installMethod (on, name, value) {
  Object.defineProperty(on.prototype, name, {
    value, enumerable: false, configurable: true
  })
}

const ucfirst = s => s.replace(/^([a-z])/, m => m.toUpperCase())

const maybeDefault = args => args.length ? { default: args[0] } : {}

export function ro (...args) {
  return maybeDefault(args)
}

export function rw (...args) {
  return { writable: true, ...maybeDefault(args) }
}

export function rwp (...args) {
  return { writer: true, ...maybeDefault(args) }
}

export function lazy (builder) {
  return { builder }
}

function validateHasPairs (className, hasPairs) {
  const problems = []
  const badDefaults = hasPairs.flatMap(
    ([ k, v ]) => (
      (Object.has(v, 'default')
        && typeof v.default === 'object'
        && v.default !== null)
      ? k : []
    )
  )
  problems.push('default cannot be an object for: ' + badDefaults.join(', '))
  const badBuilders = hasPairs.flatMap(
    ([ k, v ]) => (
      (Object.has(v, 'builder')
        && !(
          typeof v.builder === 'string'
          || typeof v.builder === 'symbol'
          || typeof v.builder === 'function'))
      ? k : []
    )
  )
  problems.push(
    'builder must be string/symbol/function for: ' + badBuilders.join(', ')
  )
  const badWriters = hasPairs.flatMap(
    ([ k, v ]) => (
      (Object.has(v, 'writer')
        && !(
          typeof v.writer === 'string'
          || typeof v.writer === 'symbol'))
      ? k : []
    )
  )
  problems.push(
    'writer must be string/symbol for: ' + badWriters.join(', ')
  )
  if (problems.length) {
    throw [ `Errors creating ${className}:`, ...problems ].join("\n")
  }
}

export function Class (className, meta, methods) {
  const superClass = meta.extends ?? Object
  const classHas = meta.has ?? {}
  for (const name in classHas) {
    if (typeof classHas[name] === 'function') {
      classHas[name] = classHas[name]()
    }
    if (classHas[name].writer === true) {
      classHas[name].writer = `set${ucfirst(name)}_`
    }
  }
  const withProto = meta.with ?? []
  const { BUILDARGS, BUILD } = meta
  const newClass = {
    [className]: class extends superClass {

      static [ClassSymbol.has] = classHas

      constructor (args) {
        let superArgs = arguments
        if (BUILDARGS) {
          const built = BUILDARGS.call(newClass, args)
          if (Array.isArray(built)) {
            [ args, superArgs ] = built
          } else if (typeof built === 'object') {
            args = built
          } else {
            throw `${className} BUILDARGS returned neither array nor object`
          }
        }
        super(...superArgs)
        const missingRequired = required.filter(n => !Object.has(args, n))
        if (missingRequired.length) {
          throw "Missing required arguments: " + missingRequired.join(', ')
        }
        for (const [ k, v ] of hasPairs) {
          let value
          if (Object.has(args, k)) {
            value = args[k]
          } else if (Object.has(v, 'default')) {
            if (typeof v.default == 'function') {
              value = v.default.call(this)
            } else {
              value = v.default
            }
          } else {
            continue
          }
          const writable = !!v.writable
          function definer (value) {
            Object.defineProperty(this, k, {
              value, writable, configurable: true
            })
          }
          definer.call(this, value)
          if (v.writer) this[v.writer] = value
        }
        if (BUILD) BUILD.call(this, args)
      }
    }
  }[className]
  Object.setPrototypeOf(methods, Object.getPrototypeOf(newClass.prototype))
  for (const methodName in methods) {
    installMethod(newClass, methodName, methods[methodName])
  }
  for (const entry of withProto) {
    const [ roleFunction, ...roleArgs ]
      = Array.isArray(entry) ? entry : [entry]
    const [ roleMeta, roleMethods ] = roleFunction.call(newClass, roleArgs)
    if (roleMeta.with) throw 'NYI, soz'
    if (roleMeta.extends) {
      throw `${roleFunction,name} is a role and cannot extends`
    }
    for (const name in (roleMeta.has??{})) {
      if (classHas[name]) continue
      let thisHas = roleMeta.has[name]
      if (typeof thisHas === 'function') {
        thisHas = thisHas()
      }
      if (thisHas.writer === true) {
        thisHas.writer = `set${ucfirst(name)}_`
      }
      classHas[name] = thisHas
    }
    for (const name in roleMethods) {
      if (methods[name]) continue
      const method = methods[name] = roleMethods[name]
      installMethod(newClass, name, method)
    }
  }
  const hasPairs = Object.entries(classHas)
  validateHasPairs(className, hasPairs)
  const required = hasPairs.flatMap(
    ([ k, v ]) => (
      ((Object.has(v, 'default') && typeof v.default !== 'undefined')
        || v.builder)
      ? [] : k
    )
  )
  for (const [k, v] of hasPairs) {
    let { builder } = v
    if (!builder) continue
    Object.setPrototypeOf(v, newClass.prototype)
    if (typeof builder === 'function') {
      const method = builder
      builder = `build${ucfirst(k)}_`
      installMethod(newClass, builder, method)
    }
    Object.defineProperty(newClass.prototype, k, {
      get () {
        const value = this[builder]()
        Object.defineProperty(this, k, { value, configurable: true })
        return value
      },
      configurable: true,
    })
  }
  return newClass
}
