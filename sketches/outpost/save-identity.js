import { pluginSymbols } from '../outpost-plugin.js'

const { onLoaded, onConnected, onDisconnected } = pluginSymbols

export const connectionIdentities = new Map()

export const plugin = {
  [onLoaded] (command) {
    command.callHandlers.listConnectionIdentities = () => {
      return Promise.resolve([ ...connectionIdentities.values() ])
    }
  },
  [onConnected] (command, nexus) {
    nexus.callHandlers.setConnectionIdentity = v => {
      connectionIdentities.set(nexus, v)
      return Promise.resolve(true)
    }
  },
  [onDisconnected] (command, nexus) {
    connectionIdentities.delete(nexus)
  },
}
