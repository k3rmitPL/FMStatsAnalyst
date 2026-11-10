// Shared state for the formula editor components, passed down with provide/inject.
//
// Blocks are addressed by their path from the metric object, e.g.
// ['expression', 'left', 'args', 0]. Moving and inserting blocks works on paths, so a block
// can be dragged anywhere in the tree.

import { inject, provide, ref } from 'vue'

import { BLOCKS_BY_ID } from '@/services/expression'

const KEY = Symbol('formula-editor')
export const DRAG_TYPE = 'application/x-fm-formula-block'

function getAt(root, path) {
  return path.reduce((obj, key) => (obj == null ? undefined : obj[key]), root)
}

function setAt(root, path, value) {
  getAt(root, path.slice(0, -1))[path.at(-1)] = value
}

function isPrefix(prefix, path) {
  return prefix.length <= path.length && prefix.every((key, i) => path[i] === key)
}

/** Paths of empty slots inside a node, in reading order. */
function emptySlots(node) {
  switch (node.type) {
    case 'op':
      return ['left', 'right'].filter((k) => !node[k]).map((k) => [k])
    case 'call':
      return node.args.flatMap((a, i) => (a ? [] : [['args', i]]))
    case 'if':
      return ['left', 'right', 'then', 'else'].filter((k) => !node[k]).map((k) => [k])
    case 'weighted':
      return node.items.flatMap((item, i) => (item.node ? [] : [['items', i, 'node']]))
    default:
      return []
  }
}

/**
 * @param target  ref to the object holding the formula (the metric)
 * @param options { columns: ref([{ value, label }]), distinctValues(column) }
 */
export function provideFormulaEditor(target, options) {
  const selectedPath = ref(null)
  const dragging = ref(false)

  const editor = {
    selectedPath,
    dragging,
    columns: options.columns,
    knownColumns: options.knownColumns,
    distinctValues: options.distinctValues,

    get(path) {
      return getAt(target.value, path)
    },

    set(path, node) {
      setAt(target.value, path, node)
    },

    remove(path) {
      setAt(target.value, path, null)
      if (selectedPath.value && isPrefix(path, selectedPath.value)) selectedPath.value = path
    },

    select(path) {
      selectedPath.value = path
    },

    /**
     * Puts a new block into a slot. If the slot already holds a block, that block is moved
     * into the new block's first empty slot (dropping "÷" on [Shots] gives [Shots] ÷ □).
     */
    insert(path, blockId) {
      const template = BLOCKS_BY_ID[blockId]
      if (!template) return
      const created = template.create()
      const existing = getAt(target.value, path)
      if (existing) {
        const slot = emptySlots(created)[0]
        if (slot) setAt(created, slot, existing)
      }
      setAt(target.value, path, created)
      // Continue with the new block's first empty slot.
      const next = emptySlots(created)[0]
      selectedPath.value = next ? [...path, ...next] : null
    },

    /** Moves a block; if the target slot is filled, the two blocks swap places. */
    move(from, to) {
      if (isPrefix(from, to) || isPrefix(to, from)) return
      const moving = getAt(target.value, from)
      const replaced = getAt(target.value, to)
      setAt(target.value, to, moving)
      setAt(target.value, from, replaced ?? null)
    },

    /** Handles a drop of palette or tree data on a slot. */
    drop(path, event) {
      const raw = event.dataTransfer.getData(DRAG_TYPE)
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.kind === 'new') editor.insert(path, data.blockId)
      else if (data.kind === 'move') editor.move(data.path, path)
    },
  }

  provide(KEY, editor)
  return editor
}

/** The surrounding formula editor, or null outside one (e.g. ColumnInput on the Views page). */
export function useFormulaEditor() {
  return inject(KEY, null)
}
