<script setup>
// Edits the notes of one player (a row's Notes value).

import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  // Shown in the heading, e.g. the player's name.
  title: { type: String, default: 'Notes' },
  value: { type: String, default: '' },
})

const open = defineModel('open', { type: Boolean, default: false })
// Receives the edited text.
const emit = defineEmits(['save'])

const dialog = ref(null)
const textarea = ref(null)
const text = ref('')

watch(open, async (isOpen) => {
  if (isOpen) {
    text.value = props.value
    if (!dialog.value.open) dialog.value.showModal()
    await nextTick()
    textarea.value?.focus()
  } else if (dialog.value.open) {
    dialog.value.close()
  }
})

function submit() {
  emit('save', text.value)
  open.value = false
}

// Ctrl/Cmd+Enter saves; plain Enter adds a line.
function onKeydown(event) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <dialog ref="dialog" class="notes-dialog" @close="open = false">
    <form class="dialog-body" @submit.prevent="submit">
      <h2>{{ title }}</h2>
      <textarea ref="textarea" v-model="text" aria-label="Notes" @keydown="onKeydown"></textarea>
      <footer>
        <button type="button" class="short" @click="open = false">Cancel</button>
        <button type="submit" class="short primary" title="Save (Ctrl+Enter)">Save</button>
      </footer>
    </form>
  </dialog>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.notes-dialog {
  max-width: calc(100vw - 2rem);
  padding: 0;
  color: $text-color;
  background: color.adjust($background-color, $lightness: 3%);
  border: 1px solid color.adjust($background-color, $lightness: 15%);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);

  &::backdrop {
    background: rgba(0, 0, 0, 0.55);
  }
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
}

h2 {
  margin: 0;
  font-size: 1.25rem;
}

textarea {
  box-sizing: border-box;
  width: 350px;
  max-width: 100%;
  height: 150px;
  resize: both;
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
