// The item open in an editor page (metric or view), kept in the URL and remembered in this browser.
// A `?<queryKey>=<id>` in the URL wins (e.g. a link to edit a specific view); otherwise the item
// last open here is reopened, or the first item when that one no longer exists.

import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { readPreference, writePreference } from '@/utils/preferences'

const isId = (v) => typeof v === 'string' && v !== ''

/**
 * @param preferenceKey  key for the remembered id
 * @param queryKey       URL query parameter holding the id
 * @param ids            getter returning the ids that can be selected, in list order
 * @param ready          getter returning true once the list has loaded
 */
export function useRememberedSelection({ preferenceKey, queryKey, ids, ready }) {
  const route = useRoute()
  const router = useRouter()

  const fromQuery = route.query[queryKey]
  const selected = ref(isId(fromQuery) ? fromQuery : readPreference(preferenceKey, null, isId))

  // Wait for the list before checking the id, so a remembered item isn't dropped during loading.
  watch(
    [ids, ready],
    ([list, isReady]) => {
      if (isReady && !list.includes(selected.value)) selected.value = list[0] ?? null
    },
    { immediate: true },
  )

  watch(selected, (id) => {
    if (id) writePreference(preferenceKey, id)
    if ((route.query[queryKey] ?? null) === id) return
    const query = { ...route.query }
    if (id) query[queryKey] = id
    else delete query[queryKey]
    router.replace({ query })
  })

  // Follow the URL when it changes while the page is open (e.g. browser back).
  watch(
    () => route.query[queryKey],
    (id) => {
      if (isId(id) && id !== selected.value) selected.value = id
    },
  )

  return selected
}
