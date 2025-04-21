import { pluginSymbols } from '../outpost-plugin.js'

export const connectionIdentities = new Map()

export const plugin = {
  [pluginSymbols.onLoaded] (command) {
    command.callHandlers.listConnectionIdentities = () => {
      return Promise.resolve([ ...connectionIdentities.values() ])
    }
  },
  [pluginSymbols.onConnected] (command, nexus) {
    nexus.callHandlers.setConnectionIdentity = v => {
      connectionIdentities.set(nexus, v)
      return Promise.resolve(true)
    }
  }
}
