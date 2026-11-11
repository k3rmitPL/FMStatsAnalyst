<script setup>
import '@/assets/scss/app.scss'
import AppUpdate from '@/components/AppUpdate.vue'
import { useInstallPrompt } from '@/composables/useInstallPrompt'

const { canInstall, install } = useInstallPrompt()
</script>

<template>
  <nav id="main-nav">
    <RouterLink to="/" class="logo" aria-label="FM Stats Analyst home">
      <strong>FM</strong> Stats Analyst
    </RouterLink>
    <RouterLink to="/analyse">Analyse</RouterLink>
    <RouterLink to="/metrics">Metrics</RouterLink>
    <button
      v-if="canInstall"
      type="button"
      class="install"
      title="Install FM Stats Analyst as an app on this device"
      @click="install"
    >
      Install app
    </button>
  </nav>

  <main>
    <RouterView />
  </main>

  <AppUpdate />
</template>

<style scoped lang="scss">
#main-nav {
  align-items: center;
}

.install {
  margin-left: auto;
  padding: 0.25rem 0.75rem;
  white-space: nowrap;
}

// The id keeps these above the global `nav#main-nav a` link styles.
#main-nav .logo {
  font-size: 1.15rem;
  font-weight: 300;
  letter-spacing: 0.01em;
  opacity: 1;
  white-space: nowrap;

  strong {
    color: $accent-color;
    font-weight: 700;
  }
}

// On narrow screens the mark alone is enough.
@media (max-width: 480px) {
  .logo-text {
    display: none;
  }
}
</style>
