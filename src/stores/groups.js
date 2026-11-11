// Groups (folders) for a saved list of metrics or views.
//
// A group: { id, name, parentId }  (parentId null = top level). Groups can be nested.
// Items say which group they are in with `groupId` (null or an unknown id = top level).
// Group changes, like the list order, take effect immediately; they are not part of an item's
// unsaved edits.

import { computed } from 'vue'

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })

/**
 * @param groups  ref holding the saved array of groups
 * @param saved   ref holding the saved array of items
 * @param drafts  the items' drafts (see drafts.js)
 */
export function createGroups(groups, saved, drafts) {
  const ids = computed(() => new Set(groups.value.map((g) => g.id)))

  /** The group an item or group is in, null when top level (or its group no longer exists). */
  function parentOf(itemOrGroup) {
    const id = 'parentId' in itemOrGroup ? itemOrGroup.parentId : itemOrGroup.groupId
    return id != null && ids.value.has(id) ? id : null
  }

  function find(id) {
    return groups.value.find((g) => g.id === id) ?? null
  }

  /** Child groups of a group (null = top level), alphabetically. */
  function children(parentId) {
    return groups.value.filter((g) => parentOf(g) === parentId).sort(byName)
  }

  /** Ids of a group and every group nested in it. */
  function subtree(id) {
    const result = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const g of groups.value) {
        if (!result.has(g.id) && result.has(parentOf(g))) {
          result.add(g.id)
          grew = true
        }
      }
    }
    return result
  }

  /** Items (saved and unsaved) inside a group, including nested groups. */
  function itemsIn(id) {
    const inside = subtree(id)
    return drafts.working.filter((item) => inside.has(parentOf(item)))
  }

  /** "Parent / Child" names, for menus. */
  function path(id) {
    const names = []
    let group = find(id)
    const seen = new Set()
    while (group && !seen.has(group.id)) {
      seen.add(group.id)
      names.unshift(group.name)
      group = find(parentOf(group))
    }
    return names.join(' / ')
  }

  /** Every group as { id, path }, ordered like the tree, for <select> options. */
  const options = computed(() => {
    const result = []
    const walk = (parentId) => {
      for (const g of children(parentId)) {
        result.push({ id: g.id, path: path(g.id) })
        walk(g.id)
      }
    }
    walk(null)
    return result
  })

  function add(name, parentId = null) {
    const group = { id: crypto.randomUUID(), name, parentId }
    groups.value.push(group)
    return group
  }

  function rename(id, name) {
    const group = find(id)
    if (group && name.trim()) group.name = name.trim()
  }

  /** Moves a group into another one (null = top level); refuses to move it into itself. */
  function moveGroup(id, parentId) {
    const group = find(id)
    if (!group || (parentId != null && subtree(id).has(parentId))) return false
    group.parentId = parentId
    return true
  }

  /** Moves an item into a group (null = top level), saved or not, without marking it edited. */
  function moveItem(itemId, groupId) {
    const savedItem = saved.value.find((item) => item.id === itemId)
    if (savedItem) savedItem.groupId = groupId
    if (drafts.byId[itemId]) drafts.byId[itemId].groupId = groupId
  }

  /** Swaps a saved item with its previous (-1) or next (1) saved neighbour in the same group. */
  function moveItemBy(itemId, delta) {
    const list = saved.value
    const index = list.findIndex((item) => item.id === itemId)
    if (index === -1) return
    const group = parentOf(list[index])
    let target = index + delta
    while (target >= 0 && target < list.length && parentOf(list[target]) !== group) target += delta
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
  }

  /** Deletes a group with its nested groups and every item in them (saved or not). */
  function remove(id) {
    const inside = subtree(id)
    for (const item of itemsIn(id)) drafts.remove(item.id)
    groups.value = groups.value.filter((g) => !inside.has(g.id))
  }

  /** Deletes every item and group. */
  function clear() {
    for (const item of drafts.items) drafts.remove(item.id)
    groups.value = []
  }

  /** Adds imported groups; a group with the same id as an existing one is updated. */
  function merge(imported) {
    for (const group of imported) {
      const existing = find(group.id)
      if (existing) Object.assign(existing, group)
      else groups.value.push(group)
    }
    repair()
  }

  /** Moves groups caught in a parent cycle (only possible from edited files) to the top level. */
  function repair() {
    for (;;) {
      const reachable = new Set()
      const walk = (parentId) => {
        for (const g of groups.value) {
          if (parentOf(g) === parentId && !reachable.has(g.id)) {
            reachable.add(g.id)
            walk(g.id)
          }
        }
      }
      walk(null)
      const stranded = groups.value.find((g) => !reachable.has(g.id))
      if (!stranded) return
      stranded.parentId = null
    }
  }

  return {
    get list() {
      return groups.value
    },
    parentOf,
    find,
    children,
    subtree,
    itemsIn,
    path,
    get options() {
      return options.value
    },
    add,
    rename,
    moveGroup,
    moveItem,
    moveItemBy,
    remove,
    clear,
    merge,
    repair,
  }
}

/** Validates groups read from a JSON file (optional `groups` list next to the items). */
export function parseGroups(data) {
  const list = Array.isArray(data?.groups) ? data.groups : []
  return list
    .filter((g) => g && typeof g.id === 'string' && g.id && typeof g.name === 'string')
    .map((g) => ({
      id: g.id,
      name: g.name,
      parentId: typeof g.parentId === 'string' ? g.parentId : null,
    }))
}
