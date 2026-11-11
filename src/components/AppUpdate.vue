<script setup>
// Registers the service worker and tells the user when the app works offline or when a new
// version has been downloaded. The new version only takes over when they choose to reload.
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW()

function close() {
  offlineReady.value = false
  needRefresh.value = false
}
</script>

<template>
  <div v-if="needRefresh || offlineReady" class="app-update" role="status">
    <span v-if="needRefresh">A new version of the app is available.</span>
    <span v-else>The app is ready to work offline.</span>
    <button v-if="needRefresh" type="button" @click="updateServiceWorker()">Reload</button>
    <button type="button" @click="close">{{ needRefresh ? 'Later' : 'OK' }}</button>
  </div>
</template>

<style scoped lang="scss">
.app-update {
  padding: 0.75rem 1rem;
  background: $card-background;
  border: 1px solid $card-border;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  align-items: center;
  gap: 0.75rem;
  display: flex;
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 100;

  span {
    margin-right: 0.25rem;
  }
}
</style>
