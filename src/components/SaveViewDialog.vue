<script setup>
// Asks for a name when the table's layout is saved as a new view.

import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({
  // Names already used, to warn about duplicates.
  existingNames: { type: Array, default: () => [] },
  initialName: { type: String, default: '' },
})

const open = defineModel('open', { type: Boolean, default: false })
// Receives the trimmed name.
const emit = defineEmits(['save'])

const dialog = ref(null)
const nameInput = ref(null)
const name = ref('')

const trimmedName = computed(() => name.value.trim())
const duplicate = computed(() => props.existingNames.includes(trimmedName.value))
const canSave = computed(() => !!trimmedName.value)

watch(open, async (isOpen) => {
  if (isOpen) {
    name.value = props.initialName
    if (!dialog.value.open) dialog.value.showModal()
    await nextTick()
    nameInput.value?.select()
  } else if (dialog.value.open) {
    dialog.value.close()
  }
})

function submit() {
  if (!canSave.value) return
  emit('save', trimmedName.value)
  open.value = false
}
</script>

<template>
  <dialog ref="dialog" class="save-dialog" @close="open = false">
    <form class="dialog-body" @submit.prevent="submit">
      <h2>Save as new view</h2>
      <label class="field">
        Name
        <input ref="nameInput" v-model="name" type="text" required />
      </label>
      <p v-if="duplicate" class="warning">Another view already has this name.</p>
      <footer>
        <button type="button" class="short" @click="open = false">Cancel</button>
        <button type="submit" class="short primary" :disabled="!canSave">Save</button>
      </footer>
    </form>
  </dialog>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.save-dialog {
  width: min(24rem, calc(100vw - 2rem));
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

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;

  input {
    box-sizing: border-box;
    width: 100%;
  }
}

.warning {
  margin: -0.4rem 0 0;
  color: #f2c94c;
  font-size: 0.8rem;
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
</style>
