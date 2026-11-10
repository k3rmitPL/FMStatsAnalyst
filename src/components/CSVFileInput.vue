<template>
  <span class="csv-loader">
    <input id="csvFile" ref="fileInput" type="file" accept=".csv" hidden @change="onFileSelected" />
    <button
      v-if="!isProcessing"
      type="button"
      class="short"
      title="Load a CSV file exported from Football Manager"
      @click="fileInput.click()"
    >
      Load CSV...
    </button>
    <progress v-else id="progressBar" :value="progress" max="100"></progress>
    <span v-if="statusMessage" class="status" :class="{ error: isError }">{{ statusMessage }}</span>
  </span>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'

import { importCsvFile } from '@/services/csvImport'

const emit = defineEmits(['imported'])

const fileInput = ref(null)
const statusMessage = ref('')
const isError = ref(false)
const isProcessing = ref(false)
const progress = ref(0)
// The success message disappears after a while; errors stay until the next file.
let statusTimer = null
onBeforeUnmount(() => clearTimeout(statusTimer))

async function onFileSelected(evt) {
  const file = evt.target.files[0]
  // Clear the input, so choosing the same file again still triggers a change.
  evt.target.value = ''
  if (!file) return

  clearTimeout(statusTimer)
  isError.value = false
  isProcessing.value = true
  try {
    const { importId, rowCount } = await importCsvFile(file, (percent, message) => {
      progress.value = percent
      statusMessage.value = message
    })
    statusMessage.value = `Saved ${rowCount} rows from ${file.name}.`
    statusTimer = setTimeout(() => (statusMessage.value = ''), 6000)
    emit('imported', importId)
  } catch (error) {
    statusMessage.value = `Error: ${error.message}`
    isError.value = true
  } finally {
    isProcessing.value = false
    progress.value = 0
  }
}
</script>
<style lang="scss" scoped>
@use 'sass:color';

.csv-loader {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}

progress {
  width: 8rem;
}

.status {
  font-size: 0.85rem;
  opacity: 0.85;

  &.error {
    color: #ff8a8a;
    opacity: 1;
  }
}
</style>
