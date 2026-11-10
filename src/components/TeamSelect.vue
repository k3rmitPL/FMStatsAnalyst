<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  // Team names to choose from, in display order.
  teams: { type: Array, required: true },
})

// Selected team name ('' = none).
const team = defineModel({ type: String, default: '' })

const isOpen = ref(false)
const filter = ref('')
// Index of the keyboard-highlighted option in `filteredTeams`.
const activeIndex = ref(0)
const root = ref(null)
const filterInput = ref(null)
const list = ref(null)

const filteredTeams = computed(() => {
  const term = filter.value.trim().toLowerCase()
  if (!term) return props.teams
  return props.teams.filter((t) => t.toLowerCase().includes(term))
})

watch(filteredTeams, () => {
  activeIndex.value = 0
})

async function open() {
  isOpen.value = true
  filter.value = ''
  const selected = props.teams.indexOf(team.value)
  activeIndex.value = Math.max(0, selected)
  await nextTick()
  filterInput.value?.focus()
  scrollActiveIntoView()
}

function close() {
  isOpen.value = false
}

function choose(name) {
  team.value = name
  close()
}

function scrollActiveIntoView() {
  list.value?.children[activeIndex.value]?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(evt) {
  if (!isOpen.value) return
  const count = filteredTeams.value.length
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
    choose(filteredTeams.value[activeIndex.value])
  }
}

function onDocumentPointerDown(evt) {
  if (isOpen.value && root.value && !root.value.contains(evt.target)) close()
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="team-select" @keydown="onKeydown">
    <span class="label">Highlight Team</span>
    <button
      type="button"
      class="dropdown-expand"
      :aria-expanded="isOpen"
      :disabled="!teams.length"
      @click="isOpen ? close() : open()"
    >
      {{ team || 'None' }}
    </button>
    <button
      v-if="team"
      type="button"
      class="clear"
      title="Clear team"
      aria-label="Clear team"
      @click="team = ''"
    >
      ×
    </button>

    <div v-if="isOpen" class="panel">
      <input ref="filterInput" v-model="filter" type="search" placeholder="Search teams" />
      <ul ref="list" role="listbox">
        <li
          v-for="(name, index) in filteredTeams"
          :key="name"
          role="option"
          :aria-selected="name === team"
          :class="{ active: index === activeIndex, selected: name === team }"
          @pointerenter="activeIndex = index"
          @click="choose(name)"
        >
          {{ name }}
        </li>
      </ul>
      <p v-if="!filteredTeams.length" class="empty">No matching teams</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.team-select {
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
  left: 0;
  width: 18rem;
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
  padding: 0.25rem 0.4rem;
  font-size: 0.875rem;
  border-radius: 3px;
  cursor: pointer;

  &.active {
    background: color.adjust($background-color, $lightness: 10%);
  }

  &.selected {
    color: #ffd166;
    font-weight: 500;
  }
}

.empty {
  margin: 0.25rem 0.4rem;
  font-size: 0.875rem;
  opacity: 0.7;
}
</style>
