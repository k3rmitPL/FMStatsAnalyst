<script setup>
// A "three dots" button opening a list of actions. Put <button class="menu-item"> elements
// (and <hr> separators) in the default slot; the menu closes after an item is clicked.

import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({
  // Accessible name and tooltip of the toggle button.
  label: { type: String, default: 'More actions' },
})

const isOpen = ref(false)
const root = ref(null)
const panel = ref(null)
const toggle = ref(null)

function items() {
  return [...(panel.value?.querySelectorAll('.menu-item:not(:disabled)') ?? [])]
}

async function open() {
  isOpen.value = true
  await nextTick()
  items()[0]?.focus()
}

function close(returnFocus = false) {
  console.log('close menu')
  isOpen.value = false
  if (returnFocus) toggle.value?.focus()
}

// Any enabled item closes the menu once its own click handler has run.
function onPanelClick(event) {
  if (event.target.closest('.menu-item')) close()
}

function onKeydown(event) {
  if (!isOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const list = items()
    const index = list.indexOf(document.activeElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    list[(index + step + list.length) % list.length]?.focus()
  }
}

function onDocumentPointerDown(event) {
  if (isOpen.value && root.value && !root.value.contains(event.target)) close()
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="action-menu" @keydown="onKeydown">
    <button
      ref="toggle"
      type="button"
      class="short menu-toggle"
      :title="label"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      @click="isOpen ? close() : open()"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="3" cy="8" r="1.4" />
        <circle cx="8" cy="8" r="1.4" />
        <circle cx="13" cy="8" r="1.4" />
      </svg>
    </button>

    <div v-if="isOpen" ref="panel" class="panel" role="menu" @click="onPanelClick">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.action-menu {
  position: relative;
  display: inline-flex;
}

button.menu-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-right: 0.6rem;
  padding-left: 0.6rem;

  svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
}

.panel {
  position: absolute;
  z-index: 1000;
  top: calc(100% + 0.4rem);
  right: 0;
  display: flex;
  flex-direction: column;
  min-width: 13rem;
  padding: 0.35rem;
  background: color.adjust($background-color, $lightness: 3%);
  border: 1px solid color.adjust($background-color, $lightness: 15%);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

// Menu items: plain rows instead of the app's raised buttons.
:slotted(button.menu-item) {
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  margin: 0;
  padding: 0.4rem 0.6rem;
  color: $text-color;
  font: inherit;
  font-size: 0.9rem;
  text-align: left;
  white-space: nowrap;
  background-color: transparent;
  border: 0;
  border-radius: 4px;
  box-shadow: none;
  cursor: pointer;
}

:slotted(button.menu-item:hover:not(:disabled)),
:slotted(button.menu-item:focus-visible) {
  background-color: color.adjust($background-color, $lightness: 10%);
  outline: none;
}

:slotted(button.menu-item:active:not(:disabled)) {
  top: 0;
  left: 0;
  box-shadow: none;
}

:slotted(button.menu-item:disabled) {
  opacity: 0.4;
  cursor: default;
}

:slotted(button.menu-item.danger) {
  color: #ff8a8a;
  background-color: transparent;
}

:slotted(button.menu-item.danger:hover:not(:disabled)) {
  background-color: #461515;
}

:slotted(hr) {
  width: 100%;
  margin: 0.3rem 0;
  border: 0;
  border-top: 1px solid color.adjust($background-color, $lightness: 12%);
}
</style>
