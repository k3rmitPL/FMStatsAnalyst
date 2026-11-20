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

/** Paths of all child slots of a node (filled or not), in reading order. */
function childSlots(node) {
  switch (node.type) {
    case 'op':
      return [['left'], ['right']]
    case 'call':
      return node.args.map((_, i) => ['args', i])
    case 'if':
      return [['left'], ['right'], ['then'], ['else']]
    case 'weighted':
      return node.items.map((_, i) => ['items', i, 'node'])
    default:
      return []
  }
}

/** Paths of empty slots inside a node, in reading order. */
function emptySlots(node) {
  return childSlots(node).filter((slot) => !getAt(node, slot))
}

/**
 * Number of blocks under `path` that would be lost if the block at `keep` (a descendant)
 * replaced it: everything except `keep`'s subtree and the blocks wrapping it.
 */
function blocksLostByUnwrap(root, path, keep) {
  let count = 0
  const walk = (current) => {
    if (isPrefix(keep, current)) return
    const node = getAt(root, current)
    if (!node) return
    if (!isPrefix(current, keep)) count++
    for (const slot of childSlots(node)) walk([...current, ...slot])
  }
  walk(path)
  return count
}

/** Number of blocks in a subtree, the node itself included. */
function countBlocks(node) {
  if (!node) return 0
  return 1 + childSlots(node).reduce((sum, slot) => sum + countBlocks(getAt(node, slot)), 0)
}

function blocksText(count) {
  return count === 1 ? '1 block' : `${count} blocks`
}

/**
 * @param target  ref to the object holding the formula (the metric)
 * @param options { columns: ref([{ value, label }]), distinctValues(column) }
 */
export function provideFormulaEditor(target, options) {
  const selectedPath = ref(null)
  const dragging = ref(false)
  // The innermost block under the pointer, which shows its name tab.
  const hoveredPath = ref(null)

  const editor = {
    selectedPath,
    dragging,
    hoveredPath,
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
     * If the new block has no slot for it, the existing block is replaced after confirming.
     */
    insert(path, blockId) {
      const template = BLOCKS_BY_ID[blockId]
      if (!template) return
      const created = template.create()
      const existing = getAt(target.value, path)
      if (existing) {
        const slot = emptySlots(created)[0]
        if (slot) {
          setAt(created, slot, existing)
        } else {
          const what = blocksText(countBlocks(existing))
          const message = `"${template.label}" can't hold the block you dropped it on, so ${what} will be deleted. Continue?`
          if (!confirm(message)) return
        }
      }
      setAt(target.value, path, created)
      // Continue with the new block's first empty slot.
      const next = emptySlots(created)[0]
      selectedPath.value = next ? [...path, ...next] : null
    },

    /**
     * Moves a block; if the target slot is filled, the two blocks swap places. Dropping a
     * block on one of its ancestors unwraps it: the block replaces that ancestor.
     */
    move(from, to) {
      if (isPrefix(from, to)) return
      if (isPrefix(to, from)) {
        editor.unwrap(from, to)
        return
      }
      const moving = getAt(target.value, from)
      const replaced = getAt(target.value, to)
      setAt(target.value, to, moving)
      setAt(target.value, from, replaced ?? null)
    },

    /** Replaces the ancestor block at `to` with its descendant block at `from`. */
    unwrap(from, to) {
      const lost = blocksLostByUnwrap(target.value, to, from)
      if (lost > 0) {
        const what = blocksText(lost).replace(' ', ' other ')
        if (!confirm(`Unwrapping this block will delete ${what} around it. Continue?`)) return
      }
      setAt(target.value, to, getAt(target.value, from))
      selectedPath.value = to
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
