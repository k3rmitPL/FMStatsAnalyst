<script setup>
// Chart panel over the Analyse table: a radar or a butterfly chart of the table's filtered players
// and its compare players A and B (see services/charts/comparison.js for what they show in each
// case). The chart type, the chosen metrics and the typical value (mode, median or mean) belong to
// the table's view (see services/charts/panelSettings.js): the panel edits them through
// v-model:settings and the view saves them.
import { computed } from 'vue'

import ComparisonChart from '@/components/charts/ComparisonChart.vue'
import MetricPicker from '@/components/charts/MetricPicker.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import {
  BUTTERFLY_MAX_COLUMNS,
  BUTTERFLY_MAX_METRICS_PER_COLUMN,
} from '@/services/charts/butterfly'
import { RADAR_MAX_METRICS, SHOW_GROUP_WITH_TWO_PLAYERS } from '@/services/charts/comparison'
import { COMPARISON_AGGREGATES } from '@/services/charts/stats'
import { COMPARISON_TYPES } from '@/services/dashboards'
import { columnLabel, isRankedColumn } from '@/utils/columns'

// Width of one square chart column in the panel (px); the butterfly uses one per column.
const COLUMN_WIDTH = 400

const props = defineProps({
  // Every column of the dataset (custom metrics first) and their info.
  columns: { type: Array, required: true },
  columnInfo: { type: Object, required: true },
  // The players the table lists (its filters, search and shortlist applied).
  filteredRows: { type: Array, required: true },
  // The whole dataset with only the table's positions applied.
  positionsRows: { type: Array, required: true },
  // Compare players in slot order (0-2): { name, row }.
  players: { type: Array, required: true },
})

const emit = defineEmits(['close'])

// { type, metrics, columns, aggregate } (see services/charts/panelSettings.js).
const settings = defineModel('settings', { type: Object, required: true })
const update = (changes) => (settings.value = { ...settings.value, ...changes })

const chartType = computed({
  get: () => settings.value.type,
  set: (type) => update({ type }),
})
const aggregateKind = computed({
  get: () => settings.value.aggregate,
  set: (aggregate) => update({ aggregate }),
})

const label = (col) => columnLabel(col, props.columnInfo[col])

// Number columns that can be charted.
const metricColumns = computed(() =>
  props.columns.filter((c) => isRankedColumn(c, props.columnInfo[c])),
)
const available = computed(() => new Set(metricColumns.value))
const missing = (list) => list.filter((m) => !available.value.has(m))
// Until metrics are chosen, the first custom metrics.
const defaultMetrics = (count) =>
  metricColumns.value.filter((c) => props.columnInfo[c]?.metric).slice(0, count)

// Radar: the chosen metrics this dataset has. Ones it doesn't have are kept (at the end) for other
// datasets.
const radarMetrics = computed({
  get: () =>
    settings.value.metrics
      ? settings.value.metrics.filter((m) => available.value.has(m))
      : defaultMetrics(RADAR_MAX_METRICS),
  set: (value) => update({ metrics: [...value, ...missing(settings.value.metrics ?? [])] }),
})

// Butterfly: 1-3 columns of metrics (the ones this dataset has; others kept, as for the radar).
const butterflyColumns = computed({
  get: () =>
    (settings.value.columns ?? [defaultMetrics(BUTTERFLY_MAX_METRICS_PER_COLUMN)]).map((col) =>
      col.filter((m) => available.value.has(m)),
    ),
  set: (value) =>
    update({
      columns: value.map((col, i) => [...col, ...missing(settings.value.columns?.[i] ?? [])]),
    }),
})

function setButterflyColumn(index, metrics) {
  butterflyColumns.value = butterflyColumns.value.map((c, i) => (i === index ? metrics : c))
}

function addButterflyColumn() {
  if (butterflyColumns.value.length < BUTTERFLY_MAX_COLUMNS) {
    butterflyColumns.value = [...butterflyColumns.value, []]
  }
}

// The last remaining column can't be removed (its metrics can be cleared instead).
function removeButterflyColumn(index) {
  if (butterflyColumns.value.length > 1) {
    butterflyColumns.value = butterflyColumns.value.filter((_, i) => i !== index)
  }
}

const isButterfly = computed(() => chartType.value === 'butterfly')

// Whether a group's typical values are drawn (so the Mode / Median / Mean choice matters): always
// with fewer than two players; with two, only as the radar's faint group.
const showsGroup = computed(
  () => props.players.length < 2 || (!isButterfly.value && SHOW_GROUP_WITH_TWO_PLAYERS),
)

// One square column for the radar, one per column for the butterfly (a new, empty one too).
const panelStyle = computed(() => {
  const count = isButterfly.value ? Math.max(1, butterflyColumns.value.length) : 1
  return { width: `${count * COLUMN_WIDTH}px` }
})
</script>

<template>
  <aside class="chart-panel" aria-label="Chart" :style="panelStyle">
    <div class="panel-bar">
      <SegmentedControl v-model="chartType" :options="COMPARISON_TYPES" label="Chart type" />
      <SegmentedControl
        v-if="showsGroup"
        v-model="aggregateKind"
        :options="COMPARISON_AGGREGATES"
        label="Typical value of a group"
      />
      <button
        type="button"
        class="short close"
        title="Hide the chart"
        aria-label="Hide the chart"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <div v-if="!isButterfly" class="panel-bar">
      <MetricPicker
        v-model="radarMetrics"
        :columns="metricColumns"
        :label="label"
        :max="RADAR_MAX_METRICS"
      />
    </div>
    <!-- One picker per butterfly column, laid out like the chart's columns, so each starts at its
         column's left edge. -->
    <div v-else class="column-pickers">
      <div v-for="(col, i) in butterflyColumns" :key="i" class="column-picker">
        <div class="stick-left">
          <MetricPicker
            :model-value="col"
            :columns="metricColumns"
            :label="label"
            :max="BUTTERFLY_MAX_METRICS_PER_COLUMN"
            title="Metrics"
            :button-class="{ 'join-right': butterflyColumns.length > 1 }"
            @update:model-value="(value) => setButterflyColumn(i, value)"
          />
          <button
            v-if="butterflyColumns.length > 1"
            type="button"
            class="short join-left"
            :title="`Remove column ${i + 1}`"
            :aria-label="`Remove column ${i + 1}`"
            @click="removeButterflyColumn(i)"
          >
            ✕
          </button>
        </div>
        <div class="stick-right">
          <button
            v-if="
              isButterfly &&
              butterflyColumns.length < BUTTERFLY_MAX_COLUMNS &&
              i == butterflyColumns.length - 1
            "
            type="button"
            class="short"
            title="Add a column of metrics"
            @click="addButterflyColumn"
          >
            + Column
          </button>
        </div>
      </div>
    </div>

    <ComparisonChart
      :type="chartType"
      :radar-metrics="radarMetrics"
      :butterfly-columns="butterflyColumns"
      :players="players"
      :filtered-rows="filteredRows"
      :positions-rows="positionsRows"
      :aggregate="aggregateKind"
      :column-info="columnInfo"
      :label="label"
      empty-text="No players match the table's filters."
    />
  </aside>
</template>

<style lang="scss" scoped>
.chart-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 100%;
  padding: 0.5rem;
  background: $card-background;
  border: 1px solid $card-border;
  border-radius: 6px;
}

.panel-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;

  .close {
    margin-left: auto;
  }
}

// Same layout as the butterfly's chart columns (see ButterflyChart.vue: flex 1 1 260px, gap
// 1rem), so each picker starts at the left edge of its column and wraps with it.
.column-pickers {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.column-picker {
  display: flex;
  flex: 1 1 260px;
  gap: 0.5rem;
  min-width: 0;

  .stick-left {
    display: flex;
    gap: 0.5rem;
    margin-right: auto;
  }
}
</style>
