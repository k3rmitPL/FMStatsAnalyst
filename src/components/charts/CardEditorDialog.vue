<script setup>
// Popup editing a dashboard card, laid out like the Filters popup: positions on a pitch on the left
// (the dashboard's, or the card's own), and the chart on the right: title, type, size, typical
// value and metrics (a scatter's X and Y, with its reference lines). Works on a copy; Save hands
// the edited card to the page, Cancel (or a click outside the popup) drops the changes.
import { computed, ref, watch } from 'vue'

import ButterflyColumnsPicker from '@/components/charts/ButterflyColumnsPicker.vue'
import MetricPicker from '@/components/charts/MetricPicker.vue'
import PositionPicker from '@/components/PositionPicker.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import { RADAR_MAX_METRICS } from '@/services/charts/comparison'
import { DIAGONAL_SLOPES, SCATTER_VARIANTS } from '@/services/charts/scatter'
import { AGGREGATES, COMPARISON_AGGREGATES, DEFAULT_AGGREGATE } from '@/services/charts/stats'
import { CARD_SIZES, CARD_TYPES } from '@/services/dashboards'
import { columnLabel, isRankedColumn } from '@/utils/columns'

const props = defineProps({
  // The card to edit (a copy is edited), and whether it is a new one.
  card: { type: Object, default: null },
  isNew: { type: Boolean, default: false },
  // The dashboard's positions, used while the card has none of its own.
  dashboardPositions: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  columnInfo: { type: Object, required: true },
})

const open = defineModel('open', { type: Boolean, default: false })
// Receives the edited card.
const emit = defineEmits(['save'])

const dialog = ref(null)
const draft = ref(null)

watch(open, (isOpen) => {
  if (isOpen) {
    draft.value = JSON.parse(JSON.stringify(props.card))
    if (!dialog.value.open) dialog.value.showModal()
  } else if (dialog.value.open) {
    dialog.value.close()
  }
})

const label = (col) => columnLabel(col, props.columnInfo[col])
const metricColumns = computed(() =>
  props.columns.filter((c) => isRankedColumn(c, props.columnInfo[c])),
)

// Clicks on the backdrop land on the <dialog> element itself; they cancel, like the Cancel button.
function onDialogClick(event) {
  if (event.target === dialog.value) open.value = false
}

// The dashboard's positions (stored as null) or the card's own, starting from the dashboard's.
const useDashboardPositions = computed({
  get: () => draft.value?.positions == null,
  set: (on) => (draft.value.positions = on ? null : [...props.dashboardPositions]),
})
// What the pitch shows: the dashboard's positions (not editable here) or the card's own.
const pitchPositions = computed({
  get: () => draft.value.positions ?? props.dashboardPositions,
  set: (value) => {
    if (draft.value.positions != null) draft.value.positions = value
  },
})

const isScatter = computed(() => draft.value?.type === 'scatter')

// "Top" is for radars and butterflies; a scatter's reference lines fall back to the median.
watch(isScatter, (scatter) => {
  if (scatter && draft.value.aggregate === 'top') draft.value.aggregate = DEFAULT_AGGREGATE
})

// Metrics the card refers to that this dataset doesn't have; kept, but not shown in the pickers.
const missingMetrics = computed(() => {
  if (!draft.value) return []
  const available = new Set(metricColumns.value)
  const used =
    draft.value.type === 'butterfly'
      ? draft.value.columns.flat()
      : draft.value.metrics.slice(0, isScatter.value ? 2 : undefined)
  return used.filter((m) => !available.has(m))
})

// Scatter: the first two metrics are X and Y, each picked as [metric] or [].
const scatterAxis = (index) => draft.value.metrics[index] ?? ''
const scatterAxisModel = (index) =>
  computed({
    get: () => (scatterAxis(index) ? [scatterAxis(index)] : []),
    set: (value) => setScatterAxis(index, value[0] ?? ''),
  })
const scatterX = scatterAxisModel(0)
const scatterY = scatterAxisModel(1)
function setScatterAxis(index, column) {
  const next = [...draft.value.metrics]
  next[index] = column
  if (index === 1 && !next[0]) next[0] = ''
  draft.value.metrics = next
}

// The pickers work on the metrics this dataset has; missing ones are kept at the end.
const radarMetrics = computed({
  get: () => draft.value.metrics.filter((m) => !missingMetrics.value.includes(m)),
  set: (value) =>
    (draft.value.metrics = [
      ...value,
      ...draft.value.metrics.filter((m) => missingMetrics.value.includes(m)),
    ]),
})
const butterflyColumns = computed({
  get: () => draft.value.columns.map((c) => c.filter((m) => !missingMetrics.value.includes(m))),
  set: (value) =>
    (draft.value.columns = value.map((c, i) => [
      ...c,
      ...(draft.value.columns[i] ?? []).filter((m) => missingMetrics.value.includes(m)),
    ])),
})

function submit() {
  emit('save', { ...draft.value, title: draft.value.title.trim() })
  open.value = false
}
</script>

<template>
  <dialog ref="dialog" class="card-dialog" @close="open = false" @click="onDialogClick">
    <form v-if="draft" class="dialog-body" @submit.prevent="submit">
      <header>
        <h2>{{ isNew ? 'Add card' : 'Edit card' }}</h2>
        <button
          type="button"
          class="close"
          title="Cancel"
          aria-label="Cancel"
          @click="open = false"
        >
          ×
        </button>
      </header>

      <div class="sections">
        <section>
          <h3>Positions</h3>
          <label class="checkbox">
            <input v-model="useDashboardPositions" type="checkbox" />
            The dashboard's positions
          </label>
          <PositionPicker
            v-model="pitchPositions"
            :column-info="columnInfo"
            :disabled="useDashboardPositions"
          />
        </section>

        <section class="chart">
          <h3>Chart</h3>
          <label class="field">
            Title
            <input
              v-model="draft.title"
              type="text"
              placeholder="Automatic (chart type and positions)"
            />
          </label>

          <div class="row">
            <div class="field">
              Type
              <SegmentedControl v-model="draft.type" :options="CARD_TYPES" label="Chart type" />
            </div>
            <div class="field">
              Size
              <SegmentedControl v-model="draft.size" :options="CARD_SIZES" label="Card size" />
            </div>
          </div>

          <div v-if="isScatter" class="row">
            <div class="field">
              Lines
              <SegmentedControl
                v-model="draft.variant"
                :options="SCATTER_VARIANTS"
                label="Reference lines"
              />
            </div>
            <div v-if="draft.variant === 'diagonal'" class="field">
              Diagonal through
              <SegmentedControl v-model="draft.slope" :options="DIAGONAL_SLOPES" label="Diagonal" />
            </div>
          </div>

          <div v-if="!(isScatter && draft.variant === 'plain')" class="field">
            {{ isScatter ? 'Reference lines at the' : 'Typical value of a group' }}
            <SegmentedControl
              v-model="draft.aggregate"
              :options="isScatter ? AGGREGATES : COMPARISON_AGGREGATES"
              label="Typical value"
            />
          </div>

          <div v-if="isScatter" class="row">
            <div class="field axis">
              X axis
              <MetricPicker v-model="scatterX" :columns="metricColumns" :label="label" single />
            </div>
            <div class="field axis">
              Y axis
              <MetricPicker v-model="scatterY" :columns="metricColumns" :label="label" single />
            </div>
          </div>

          <div v-else class="field">
            Metrics
            <div class="metrics">
              <MetricPicker
                v-if="draft.type === 'radar'"
                v-model="radarMetrics"
                :columns="metricColumns"
                :label="label"
                :max="RADAR_MAX_METRICS"
              />
              <ButterflyColumnsPicker
                v-else
                v-model="butterflyColumns"
                :metric-columns="metricColumns"
                :label="label"
              />
            </div>
          </div>
          <p v-if="missingMetrics.length" class="warning">
            Not in this dataset (kept for others): {{ missingMetrics.join(', ') }}
          </p>
        </section>
      </div>

      <footer>
        <button type="button" class="short" @click="open = false">Cancel</button>
        <button type="submit" class="short primary">{{ isNew ? 'Add' : 'Save' }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style lang="scss" scoped>
@use 'sass:color';

// Same frame and size as the Filters popup (ViewFiltersDialog.vue).
.card-dialog {
  width: min(50rem, calc(100vw - 2rem));
  padding: 0;
  // The metric pickers' lists may reach past the dialog.
  overflow: visible;
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
  padding: 1rem 1.25rem;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;

  h2 {
    margin: 0;
    font-size: 1.25rem;
  }
}

button.close {
  padding: 0.1rem 0.55rem;
  font-size: 1.1rem;
  line-height: 1.4;
}

.sections {
  display: grid;
  // The positions column is as narrow as the pitch (its hints wrap); the chart gets the rest.
  grid-template-columns: min-content minmax(0, 1fr);
  gap: 1rem 2.5rem;

  // Stack the sections on narrow screens only.
  @media (max-width: 40rem) {
    grid-template-columns: minmax(0, 1fr);
  }
}

h3 {
  margin: 0.75rem 0 0.25rem;
  font-size: 1rem;
}

section.chart {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;

  h3 {
    margin-bottom: -0.35rem;
  }
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  font-size: 0.85rem;

  input[type='text'] {
    box-sizing: border-box;
    width: 100%;
  }
}

label.field {
  align-items: stretch;
}

.axis {
  flex: 1 1 12rem;
  align-items: stretch;
  min-width: 0;

  // The picker's button fills the field.
  :deep(.metric-picker) {
    display: flex;

    > button {
      flex: 1;
      min-width: 0;
    }
  }
}

.metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.warning {
  margin: 0;
  color: #f2c94c;
  font-size: 0.8rem;
}

// As in the Filters popup.
footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid color.adjust($background-color, $lightness: 10%);
}
</style>
