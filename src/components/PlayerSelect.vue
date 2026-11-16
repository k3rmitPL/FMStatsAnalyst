<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { foldText } from '@/utils/text'

// Longest list shown at once; typing narrows it down.
const MAX_SHOWN = 10

const props = defineProps({
  // Players to choose from, in display order: { id, name, details: string[] }.
  players: { type: Array, required: true },
  label: { type: String, default: 'Player' },
})

// Selected player id (null = none).
const player = defineModel({ default: null })

const isOpen = ref(false)
const filter = ref('')
// Index of the keyboard-highlighted option in `shownPlayers`.
const activeIndex = ref(0)
const root = ref(null)
const filterInput = ref(null)
const list = ref(null)

const selected = computed(() => props.players.find((p) => p.id === player.value) ?? null)

// Name and details of each player, prepared for searching once per list.
const searchTexts = computed(
  () => new Map(props.players.map((p) => [p, foldText([p.name, ...p.details].join(' '))])),
)

// Every word typed must appear in the name or one of the details (ignoring case and accents).
const matchingPlayers = computed(() => {
  const words = foldText(filter.value.trim()).split(/\s+/).filter(Boolean)
  if (!words.length) return props.players
  return props.players.filter((p) => {
    const text = searchTexts.value.get(p)
    return words.every((w) => text.includes(w))
  })
})
const shownPlayers = computed(() => matchingPlayers.value.slice(0, MAX_SHOWN))

watch(matchingPlayers, () => {
  activeIndex.value = 0
})

async function open() {
  isOpen.value = true
  filter.value = ''
  const index = shownPlayers.value.findIndex((p) => p.id === player.value)
  activeIndex.value = Math.max(0, index)
  await nextTick()
  filterInput.value?.focus()
  scrollActiveIntoView()
}

function close() {
  isOpen.value = false
}

function choose(p) {
  player.value = p.id
  close()
}

function scrollActiveIntoView() {
  list.value?.children[activeIndex.value]?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(evt) {
  if (!isOpen.value) return
  const count = shownPlayers.value.length
  if (evt.key === 'Escape') {
    close()
  } else if (evt.key === 'ArrowDown' && count) {
    evt.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % count
    nextTick(scrollActiveIntoView)
  } else if (evt.key === 'ArrowUp' && count) {
    evt.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + count) % count
    nextTick(scrollActiveIntoView)
  } else if (evt.key === 'Enter' && count) {
    evt.preventDefault()
    choose(shownPlayers.value[activeIndex.value])
  }
}

function onDocumentPointerDown(evt) {
  if (isOpen.value && root.value && !root.value.contains(evt.target)) close()
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="player-select" @keydown="onKeydown">
    <span class="label">{{ label }}</span>
    <button
      type="button"
      class="dropdown-expand toggle"
      :aria-expanded="isOpen"
      :disabled="!players.length"
      :title="selected ? [selected.name, ...selected.details].join(' · ') : undefined"
      @click="isOpen ? close() : open()"
    >
      {{ selected?.name || 'None' }}
    </button>
    <button
      v-if="selected"
      type="button"
      class="clear"
      title="Clear player"
      aria-label="Clear player"
      @click="player = null"
    >
      ×
    </button>

    <div v-if="isOpen" class="panel">
      <input ref="filterInput" v-model="filter" type="search" placeholder="Search players" />
      <ul ref="list" role="listbox">
        <li
          v-for="(p, index) in shownPlayers"
          :key="p.id"
          role="option"
          :aria-selected="p.id === player"
          :class="{ active: index === activeIndex, selected: p.id === player }"
          @pointerenter="activeIndex = index"
          @click="choose(p)"
        >
          <span class="name">{{ p.name }}</span>
          <span v-if="p.details.length" class="details">{{ p.details.join(' · ') }}</span>
        </li>
      </ul>
      <p v-if="!matchingPlayers.length" class="empty">No matching players</p>
      <p v-else-if="matchingPlayers.length > MAX_SHOWN" class="empty">
        Showing {{ MAX_SHOWN }} of {{ matchingPlayers.length }}, type to narrow down
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.player-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle {
  max-width: 16rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clear {
  padding: 0.5rem 0.65rem;
  line-height: 1;
}

.panel {
  position: absolute;
  z-index: 1000;
  top: calc(100% + 0.5rem);
  right: 0;
  width: 24rem;
  max-width: calc(100vw - 2rem);
  padding: 0.75rem;
  background: color.adjust($background-color, $lightness: 3%);
  border: 1px solid color.adjust($background-color, $lightness: 15%);
  border-radius: 5px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

input[type='search'] {
  width: 100%;
}

ul {
  max-height: 50vh;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

li {
  display: flex;
  flex-direction: column;
  padding: 0.3rem 0.4rem;
  font-size: 0.875rem;
  border-radius: 3px;
  cursor: pointer;

  &.active {
    background: color.adjust($background-color, $lightness: 10%);
  }

  &.selected .name {
    color: #7fb7ff;
    font-weight: 500;
  }
}

.details {
  font-size: 0.75rem;
  opacity: 0.65;
}

.empty {
  margin: 0.25rem 0.4rem;
  font-size: 0.875rem;
  opacity: 0.7;
}
</style>
