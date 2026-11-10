<script setup>
// Metrics or views organised in groups, shown like folders in a file browser.
// Groups can be nested, renamed, deleted with their contents, and items and groups can be dragged
// into other groups (or onto "Top level").

import { computed, nextTick, ref, watch } from 'vue'

import { usePreference } from '@/utils/preferences'

const DRAG_TYPE = 'application/x-fm-tree'

const props = defineProps({
  // Groups API from the library store (see stores/groups.js).
  groups: { type: Object, required: true },
  // Items to show (working copies, including unsaved ones).
  items: { type: Array, required: true },
  selectedId: { type: String, default: null },
  // item → { state: 'new' | 'dirty' | null, invalid: boolean }
  status: { type: Function, default: () => ({}) },
  // Singular / plural item names, e.g. 'metric' / 'metrics'.
  noun: { type: String, required: true },
  nounPlural: { type: String, required: true },
})

const emit = defineEmits(['select', 'add-item'])

// Collapsed group ids, remembered in this browser.
const collapsedList = usePreference(`collapsedGroups:${props.noun}`, [], Array.isArray)
const collapsed = computed(() => new Set(collapsedList.value))

const renamingId = ref(null)
const renameText = ref('')
const root = ref(null)
// What is being dragged: { kind: 'item' | 'group', id }
const dragging = ref(null)
// Group id under the pointer while dragging, or 'root'.
const dropTarget = ref(null)

/** Rows in display order: each group, then (unless collapsed) its subgroups and items. */
const rows = computed(() => {
  const result = []
  const walk = (parentId, depth) => {
    for (const group of props.groups.children(parentId)) {
      result.push({
        type: 'group',
        id: group.id,
        group,
        depth,
        count: props.groups.itemsIn(group.id).length,
      })
      if (!collapsed.value.has(group.id)) walk(group.id, depth + 1)
    }
    for (const item of props.items) {
      if (props.groups.parentOf(item) === parentId) {
        result.push({ type: 'item', id: item.id, item, depth })
      }
    }
  }
  walk(null, 0)
  return result
})

function setCollapsed(id, value) {
  const next = new Set(collapsedList.value)
  if (value) next.add(id)
  else next.delete(id)
  collapsedList.value = [...next]
}

/** Opens every group containing a group (so a selected item or new group is visible). */
function reveal(groupId) {
  let id = groupId
  const seen = new Set()
  const next = new Set(collapsedList.value)
  while (id != null && !seen.has(id)) {
    seen.add(id)
    next.delete(id)
    const group = props.groups.find(id)
    id = group ? props.groups.parentOf(group) : null
  }
  if (next.size !== collapsedList.value.length) collapsedList.value = [...next]
}

watch(
  () => props.selectedId,
  (id) => {
    const item = props.items.find((i) => i.id === id)
    const groupId = item && props.groups.parentOf(item)
    if (groupId) reveal(groupId)
  },
  { immediate: true },
)

// --- Group actions ---------------------------------------------------------

function uniqueGroupName(base, parentId) {
  const names = new Set(props.groups.children(parentId).map((g) => g.name))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i++
  return `${base} ${i}`
}

function addGroup(parentId = null) {
  const group = props.groups.add(uniqueGroupName('New group', parentId), parentId)
  if (parentId) reveal(parentId)
  startRename(group)
}

async function startRename(group) {
  renamingId.value = group.id
  renameText.value = group.name
  await nextTick()
  const input = root.value?.querySelector('.rename-input')
  input?.focus()
  input?.select()
}

function finishRename(save) {
  if (renamingId.value == null) return
  if (save) props.groups.rename(renamingId.value, renameText.value)
  renamingId.value = null
}

function deleteGroup(group) {
  const items = props.groups.itemsIn(group.id).length
  const subgroups = props.groups.subtree(group.id).size - 1
  if (items || subgroups) {
    const parts = []
    if (items) parts.push(`${items} ${items === 1 ? props.noun : props.nounPlural}`)
    if (subgroups) parts.push(`${subgroups} subgroup${subgroups === 1 ? '' : 's'}`)
    const message = `Delete the group "${group.name}" with ${parts.join(' and ')}? This cannot be undone.`
    if (!confirm(message)) return
  }
  props.groups.remove(group.id)
}

function addItem(groupId) {
  reveal(groupId)
  emit('add-item', groupId)
}

// --- Drag and drop ---------------------------------------------------------

function onDragStart(event, row) {
  if (renamingId.value) {
    event.preventDefault()
    return
  }
  dragging.value = { kind: row.type, id: row.id }
  event.dataTransfer.setData(DRAG_TYPE, row.id)
  event.dataTransfer.effectAllowed = 'move'
}

function onDragEnd() {
  dragging.value = null
  dropTarget.value = null
}

/** Whether the dragged item or group can go into a group (null = top level). */
function canDropInto(groupId) {
  const drag = dragging.value
  if (!drag) return false
  if (drag.kind === 'item') return true
  return groupId == null || !props.groups.subtree(drag.id).has(groupId)
}

function onDragOver(event, groupId) {
  if (!event.dataTransfer.types.includes(DRAG_TYPE) || !canDropInto(groupId)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dropTarget.value = groupId ?? 'root'
}

function onDragLeave(event, groupId) {
  if (event.currentTarget.contains(event.relatedTarget)) return
  if (dropTarget.value === (groupId ?? 'root')) dropTarget.value = null
}

function onDrop(event, groupId) {
  const drag = dragging.value
  const allowed = canDropInto(groupId)
  onDragEnd()
  if (!drag || !allowed) return
  event.preventDefault()
  if (drag.kind === 'item') props.groups.moveItem(drag.id, groupId)
  else props.groups.moveGroup(drag.id, groupId)
  if (groupId) reveal(groupId)
}

/** Drop target for an item row: the group the item is in. */
function itemGroup(item) {
  return props.groups.parentOf(item)
}
</script>

<template>
  <nav ref="root" class="group-tree">
    <div class="tree-actions">
      <button type="button" class="tree-button" @click="addGroup(null)">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.5 3.5h4.5l1.5 1.5h7v8h-13zM8 7.5v4M6 9.5h4" />
        </svg>
        New group
      </button>
    </div>

    <p v-if="!rows.length" class="hint">
      No {{ nounPlural }} yet. Create one or import a JSON file.
    </p>

    <div
      v-if="dragging"
      class="root-drop"
      :class="{ over: dropTarget === 'root' }"
      @dragover="onDragOver($event, null)"
      @dragleave="onDragLeave($event, null)"
      @drop="onDrop($event, null)"
    >
      Move to top level
    </div>

    <template v-for="row in rows" :key="row.id">
      <div
        v-if="row.type === 'group'"
        class="row group"
        :class="{ over: dropTarget === row.id, dragged: dragging?.id === row.id }"
        :style="{ '--depth': row.depth }"
        :draggable="renamingId !== row.id"
        @dragstart="onDragStart($event, row)"
        @dragend="onDragEnd"
        @dragover="onDragOver($event, row.id)"
        @dragleave="onDragLeave($event, row.id)"
        @drop="onDrop($event, row.id)"
      >
        <input
          v-if="renamingId === row.id"
          v-model="renameText"
          class="rename-input"
          type="text"
          aria-label="Group name"
          @keydown.enter.prevent="finishRename(true)"
          @keydown.escape.prevent="finishRename(false)"
          @blur="finishRename(true)"
        />
        <button
          v-else
          type="button"
          class="row-main"
          :aria-expanded="!collapsed.has(row.id)"
          :title="row.group.name"
          @click="setCollapsed(row.id, !collapsed.has(row.id))"
          @dblclick="startRename(row.group)"
        >
          <span class="caret" :class="{ open: !collapsed.has(row.id) }">▸</span>
          <svg class="folder" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.5 3.5h4.5l1.5 1.5h7v8h-13z" />
          </svg>
          <span class="item-name">{{ row.group.name }}</span>
          <span class="count">{{ row.count }}</span>
        </button>
        <span v-if="renamingId !== row.id" class="row-actions">
          <button
            type="button"
            class="icon"
            :title="`New ${noun} in this group`"
            @click="addItem(row.id)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
          </button>
          <button type="button" class="icon" title="New subgroup" @click="addGroup(row.id)">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M1.5 3.5h4.5l1.5 1.5h7v8h-13zM8 7.5v4M6 9.5h4" />
            </svg>
          </button>
          <button type="button" class="icon" title="Rename" @click="startRename(row.group)">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10.5 2.5l3 3-8 8h-3v-3z" />
            </svg>
          </button>
          <button
            type="button"
            class="icon danger-icon"
            title="Delete group and everything in it"
            @click="deleteGroup(row.group)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.7 9h6.6l.7-9" />
            </svg>
          </button>
        </span>
      </div>

      <div
        v-else
        class="row item"
        :class="{
          active: row.id === selectedId,
          invalid: status(row.item).invalid,
          dragged: dragging?.id === row.id,
        }"
        :style="{ '--depth': row.depth }"
        draggable="true"
        @dragstart="onDragStart($event, row)"
        @dragend="onDragEnd"
        @dragover="onDragOver($event, itemGroup(row.item))"
        @drop="onDrop($event, itemGroup(row.item))"
      >
        <button
          type="button"
          class="row-main"
          :title="
            status(row.item).state === 'new'
              ? 'Not saved yet'
              : status(row.item).state === 'dirty'
                ? 'Unsaved changes'
                : row.item.name
          "
          @click="emit('select', row.id)"
        >
          <span class="item-name">{{ row.item.name || '(no name)' }}</span>
          <span v-if="status(row.item).state === 'new'" class="badge">new</span>
          <span v-else-if="status(row.item).state === 'dirty'" class="dirty-dot">●</span>
        </button>
      </div>
    </template>
  </nav>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.group-tree {
  top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 80vh;
  overflow-y: auto;
  position: sticky;
}

.tree-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

button.tree-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  font-size: 0.85rem;

  svg {
    width: 14px;
    height: 14px;
  }
}

svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.hint {
  margin: 0.25rem 0;
  font-size: 0.85rem;
  opacity: 0.7;
}

.root-drop {
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
  text-align: center;
  border: 1px dashed color.adjust($background-color, $lightness: 25%);
  border-radius: 4px;
  opacity: 0.8;

  &.over {
    background: rgba(127, 183, 255, 0.12);
    border-color: #7fb7ff;
    opacity: 1;
  }
}

.row {
  display: flex;
  align-items: center;
  padding-left: calc(var(--depth) * 0.9rem);
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  border-radius: 4px;

  &:hover {
    background: color.adjust($background-color, $lightness: 5%);
  }

  &.dragged {
    opacity: 0.4;
  }

  &.over {
    background: rgba(127, 183, 255, 0.12);
    border-color: #7fb7ff;
  }
}

// Item names line up with the folder icons of groups at the same level.
.row.item {
  padding-left: calc(var(--depth) * 0.9rem + 0.85rem);
}

.row.item.active {
  background: color.adjust($background-color, $lightness: 9%);
  border-left-color: #7fb7ff;
}

// Plain text buttons inside rows, not the app's raised button style.
button.row-main,
button.icon {
  top: 0;
  left: 0;
  color: $text-color;
  font: inherit;
  background: none;
  border: 0;
  box-shadow: none;

  &:hover:not(:disabled) {
    background: none;
  }

  &:active:not(:disabled) {
    top: 0;
    left: 0;
    box-shadow: none;
  }
}

button.row-main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.35rem 0.6rem;
  font-size: 0.9rem;
  text-align: left;
}

.group button.row-main {
  padding-left: 0.3rem;
  font-weight: 500;
}

.caret {
  display: inline-block;
  width: 0.8rem;
  font-size: 0.75rem;
  opacity: 0.7;
  transition: transform 0.1s;

  &.open {
    transform: rotate(90deg);
  }
}

.folder {
  flex: none;
  width: 15px;
  height: 15px;
  color: #f2c94c;
}

.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item.invalid .item-name::after {
  content: ' ⚠';
  color: #f2c94c;
}

.count {
  font-size: 0.75rem;
  font-weight: 400;
  opacity: 0.55;
}

.row-actions {
  display: none;
  flex: none;
  padding-right: 0.25rem;
}

.row.group:hover .row-actions,
.row.group:focus-within .row-actions {
  display: inline-flex;
}

button.icon {
  display: inline-flex;
  padding: 3px;
  border-radius: 3px;
  opacity: 0.6;
  cursor: pointer;

  svg {
    width: 13px;
    height: 13px;
  }

  &:hover:not(:disabled) {
    background: color.adjust($background-color, $lightness: 15%);
    opacity: 1;
  }

  &.danger-icon:hover:not(:disabled) {
    color: #ff8080;
  }
}

.rename-input {
  flex: 1;
  min-width: 0;
  margin: 0.15rem 0.25rem;
  padding: 0.2rem 0.4rem;
  color: $text-color;
  font: inherit;
  font-size: 0.9rem;
  background: color.adjust($background-color, $lightness: 6%);
  border: 1px solid #7fb7ff;
  border-radius: 4px;
}

.dirty-dot {
  color: #f2c94c;
  font-size: 0.6rem;
}

.badge {
  padding: 0 0.3rem;
  color: #f2c94c;
  font-size: 0.7rem;
  border: 1px solid #f2c94c;
  border-radius: 3px;
}
</style>
