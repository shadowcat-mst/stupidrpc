import { pluginSymbols } from '../outpost-plugin.js'
import { connectionIdentities } from './save-identity.js'

// doesn't handle iterator/NEXT yet

export const plugin = {
  [pluginSymbols.onLoaded] (command) {
    command.callHandlers.routeTo = (to, ...call) => {
      let sendTo
      for (const [ nexus, identity ] of connectionIdentities.entries()) {
        // should have smarter logic here but it's a start
        if (identity.tags.includes(to)) {
          sendTo = nexus
          break
        }
      }
      if (!sendTo) throw `No connected nexus matching ${to}`
      return sendTo.call(...call)
    }
  },
}
