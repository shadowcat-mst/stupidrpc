import { pluginSymbols } from '../outpost-plugin.js'
import { $ } from 'bun'

export const plugin = {
  [pluginSymbols.onLoaded] (command) {
    Object.assign(command.callHandlers, {
      async openTab (url) {
        if (!url.match(/^http/)) throw "Doesn't look like a URL to me, bub"
        await $`rundll32.exe url.dll,FileProtocolHandler ${url}`
        return true
      }
    })
  }
}
