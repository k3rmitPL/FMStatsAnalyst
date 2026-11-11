// Offers to install the app. Chromium browsers fire `beforeinstallprompt` when the app can be
// installed; the event is kept so a button can show the browser's install dialog later.
// Other browsers (Safari, Firefox) don't fire it: there, installing goes through the browser's
// own menu ("Add to Dock", "Add to Home Screen"), and `canInstall` stays false.

import { ref } from 'vue'

const deferredPrompt = ref(null)

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt.value = event
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null
  })
}

export function useInstallPrompt() {
  async function install() {
    const event = deferredPrompt.value
    if (!event) return
    // The event can only be used once; the browser fires a new one if the user declines.
    deferredPrompt.value = null
    await event.prompt()
  }

  return { canInstall: deferredPrompt, install }
}
