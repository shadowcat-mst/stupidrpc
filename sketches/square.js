import { Class, ro, rw } from './class.js'

function DebugSelf () {
  return {
    debugSelf () { console.log(this) }
  }
}

let Square = Class('Square', {
  has: { x: ro, y: rw },
  with: DebugSelf,
}, {
  area () { return this.x * this.y },
})

let sq = new Square({ x: 3, y: 7 })

sq.debugSelf()

console.log(sq.area())

sq.y = 12

console.log(sq.area())

sq.x = 4
