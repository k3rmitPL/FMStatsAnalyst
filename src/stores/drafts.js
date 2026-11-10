// Unsaved edits of a saved list (metrics or views).
//
// Editors change a copy of an item, never the saved item itself. `save` writes the copy back to
// the saved list (which is persisted), `revert` throws the changes away. New items exist only as
// drafts until they are saved.

import { computed, reactive, ref } from 'vue'

const copy = (value) => JSON.parse(JSON.stringify(value))

/** @param saved  ref holding the saved array of `{ id, ... }` items */
export function createDrafts(saved) {
  const byId = reactive({})
  const newIds = ref([])

  const savedById = (id) => saved.value.find((item) => item.id === id)

  /** Saved items followed by new, unsaved ones (as stored, without edits). */
  const items = computed(() => [
    ...saved.value,
    ...newIds.value.map((id) => byId[id]).filter(Boolean),
  ])

  /** Same list, with edited copies in place of the saved items. */
  const working = computed(() => items.value.map((item) => byId[item.id] ?? item))

  function isNew(id) {
    return newIds.value.includes(id)
  }

  function isDirty(id) {
    const draft = byId[id]
    if (!draft) return false
    const original = savedById(id)
    return !original || JSON.stringify(draft) !== JSON.stringify(original)
  }

  const dirtyCount = computed(() => items.value.filter((item) => isDirty(item.id)).length)

  /** The editable copy of an item, created on first use. */
  function edit(id) {
    if (!byId[id]) {
      const original = savedById(id)
      if (original) byId[id] = copy(original)
    }
    return byId[id] ?? null
  }

  /** Adds a new, unsaved item. */
  function add(item) {
    byId[item.id] = item
    newIds.value.push(item.id)
  }

  function save(id) {
    const draft = byId[id]
    if (!draft) return
    const index = saved.value.findIndex((item) => item.id === id)
    if (index === -1) saved.value.push(copy(draft))
    else saved.value[index] = copy(draft)
    newIds.value = newIds.value.filter((x) => x !== id)
  }

  function revert(id) {
    const original = savedById(id)
    if (original) byId[id] = copy(original)
  }

  /** Forgets the copy (and the item itself, when it was never saved). */
  function discard(id) {
    newIds.value = newIds.value.filter((x) => x !== id)
    delete byId[id]
  }

  /** Drops the copy of an item that has no changes, so it follows later updates of the saved item. */
  function release(id) {
    if (byId[id] && !isNew(id) && !isDirty(id)) delete byId[id]
  }

  /** Deletes an item, saved or not. */
  function remove(id) {
    discard(id)
    const index = saved.value.findIndex((item) => item.id === id)
    if (index !== -1) saved.value.splice(index, 1)
  }

  // A plain object (not reactive), so Pinia doesn't treat the drafts as store state.
  return {
    byId,
    get items() {
      return items.value
    },
    get working() {
      return working.value
    },
    get dirtyCount() {
      return dirtyCount.value
    },
    isNew,
    isDirty,
    edit,
    add,
    save,
    revert,
    discard,
    release,
    remove,
  }
}
