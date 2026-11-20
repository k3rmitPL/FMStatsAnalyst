<script setup>
// One card of a dashboard: a radar, butterfly or scatter chart of the players matching the
// dashboard's conditions and the card's positions, with at most one player of its own (chosen in
// the card or by clicking a scatter dot, saved by name and club so the card works on other
// imports).
import { computed } from 'vue'

import ActionMenu from '@/components/ActionMenu.vue'
import ComparisonChart from '@/components/charts/ComparisonChart.vue'
import ScatterChart from '@/components/charts/ScatterChart.vue'
import PlayerSelect from '@/components/PlayerSelect.vue'
import { positionsPool } from '@/services/charts/stats'
import {
  CARD_SIZES,
  cardFilteredRows,
  cardPositions,
  CARD_TYPES,
  findPlayerRow,
} from '@/services/dashboards'
import { ROW_ID } from '@/services/db'
import { PLAYER_COLUMN, TEAM_COLUMN } from '@/stores/analysis'
import { columnLabel } from '@/utils/columns'

const props = defineProps({
  dashboard: { type: Object, required: true },
  card: { type: Object, required: true },
  // The dataset's rows (with metric values), columns and their info.
  rows: { type: Array, required: true },
  columns: { type: Array, required: true },
  columnInfo: { type: Object, required: true },
  // Players for the player lookup: { id, name, details }.
  players: { type: Array, required: true },
  // Shortlisted players' row ids (labelled on scatter charts).
  shortlistIds: { type: Set, default: () => new Set() },
  // Where the card is in the dashboard, for moving it.
  isFirst: { type: Boolean, default: false },
  isLast: { type: Boolean, default: false },
})

// player: the chosen player ({ name, club }) or null, for the page to store on the card.
// show-in-table: { ids, label } of players selected on a scatter chart.
// move: -1 (earlier, up) or 1 (later, down).
const emit = defineEmits(['edit', 'duplicate', 'remove', 'player', 'show-in-table', 'move'])

const label = (col) => columnLabel(col, props.columnInfo[col])
const positions = computed(() => cardPositions(props.dashboard, props.card))

const title = computed(() => {
  if (props.card.title) return props.card.title
  const type = CARD_TYPES.find((t) => t.value === props.card.type)?.label ?? 'Chart'
  return `${type} · ${positions.value.length ? positions.value.join(', ') : 'All positions'}`
})

const filteredRows = computed(() =>
  cardFilteredRows(props.rows, props.dashboard, props.card, props.columnInfo),
)
const positionsRows = computed(() => positionsPool(props.rows, positions.value, props.columnInfo))

// The card's metrics this dataset has, and the ones it doesn't.
const available = computed(() => new Set(props.columns))
const radarMetrics = computed(() => props.card.metrics.filter((m) => available.value.has(m)))
const butterflyColumns = computed(() =>
  props.card.columns.map((c) => c.filter((m) => available.value.has(m))),
)
const missingMetrics = computed(() => {
  const used = props.card.type === 'butterfly' ? props.card.columns.flat() : props.card.metrics
  return used.filter((m) => !available.value.has(m))
})

// Scatter: X and Y, when this dataset has both.
const scatterAxes = computed(() => {
  const [x, y] = props.card.metrics
  return x && y && available.value.has(x) && available.value.has(y) ? { x, y } : null
})
const info = computed(() =>
  props.card.type === 'scatter'
    ? `${filteredRows.value.length} players${props.card.variant === 'plain' ? '' : ` · ${props.card.aggregate}`}`
    : `${filteredRows.value.length} players · ${props.card.aggregate}`,
)

const playerRow = computed(() =>
  findPlayerRow(props.rows, props.card.player, PLAYER_COLUMN, TEAM_COLUMN),
)
const chartPlayers = computed(() =>
  playerRow.value
    ? [{ name: String(playerRow.value[PLAYER_COLUMN] ?? 'Player'), row: playerRow.value }]
    : [],
)

function choosePlayer(rowId) {
  const row = rowId == null ? null : props.rows.find((r) => r[ROW_ID] === rowId)
  emit('player', row ? { name: row[PLAYER_COLUMN], club: row[TEAM_COLUMN] ?? null } : null)
}

// Square columns: one for a radar or scatter, one per butterfly column (empty ones too); each as wide
// as the card's size.
const columnCount = computed(() =>
  props.card.type === 'butterfly' ? Math.max(1, butterflyColumns.value.length) : 1,
)
const columnsPerRow = computed(
  () => (CARD_SIZES.find((s) => s.value === props.card.size) ?? CARD_SIZES[0]).columnsPerRow,
)
</script>

<template>
  <article
    class="dashboard-card"
    :style="{
      '--card-columns': columnCount,
      '--columns-per-row': `${columnsPerRow}`,
    }"
  >
    <header>
      <h3 :title="title">{{ title }}</h3>
      <!-- Earlier / later in the dashboard; the cards wrap into rows, so this moves across rows. -->
      <span class="move-buttons">
        <button
          type="button"
          class="short icon join-right"
          title="Move up"
          aria-label="Move card up"
          :disabled="isFirst"
          @click="emit('move', -1)"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3 3 8.5h3.5V13h3V8.5H13z" /></svg>
        </button>
        <button
          type="button"
          class="short icon join-left"
          title="Move down"
          aria-label="Move card down"
          :disabled="isLast"
          @click="emit('move', 1)"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13 3 7.5h3.5V3h3v4.5H13z" /></svg>
        </button>
      </span>
      <ActionMenu label="Card actions">
        <button type="button" class="menu-item" role="menuitem" @click="emit('edit')">
          Edit card...
        </button>
        <button type="button" class="menu-item" role="menuitem" @click="emit('duplicate')">
          Duplicate
        </button>
        <hr />
        <button type="button" class="menu-item danger" role="menuitem" @click="emit('remove')">
          Delete card
        </button>
      </ActionMenu>
    </header>

    <div class="card-bar">
      <PlayerSelect
        v-if="players.length"
        :model-value="playerRow?.[ROW_ID] ?? null"
        :players="players"
        label="Player"
        align="left"
        @update:model-value="choosePlayer"
      />
      <span class="info">{{ info }}</span>
    </div>
    <p v-if="card.player && !playerRow" class="warning">
      {{ card.player.name }} is not in this dataset.
    </p>
    <p v-if="missingMetrics.length" class="warning">
      Not in this dataset: {{ missingMetrics.join(', ') }}
    </p>

    <div class="chart-area">
      <template v-if="card.type === 'scatter'">
        <ScatterChart
          v-if="scatterAxes && filteredRows.length"
          :rows="filteredRows"
          :x="scatterAxes.x"
          :y="scatterAxes.y"
          :column-info="columnInfo"
          :label="label"
          :variant="card.variant"
          :slope="card.slope"
          :aggregate="card.aggregate"
          :player-id="playerRow?.[ROW_ID] ?? null"
          :shortlist-ids="shortlistIds"
          fill
          @player="choosePlayer"
          @show-in-table="(selection) => emit('show-in-table', selection)"
        />
        <p v-else-if="!scatterAxes" class="hint">
          Pick the X and Y metrics in the card's settings.
        </p>
        <p v-else class="hint">
          No players match the dashboard's conditions and this card's positions.
        </p>
      </template>
      <ComparisonChart
        v-else
        :type="card.type"
        :radar-metrics="radarMetrics"
        :butterfly-columns="butterflyColumns"
        :players="chartPlayers"
        :filtered-rows="filteredRows"
        :positions-rows="positionsRows"
        :aggregate="card.aggregate"
        :column-info="columnInfo"
        :label="label"
        empty-text="No players match the dashboard's conditions and this card's positions."
        fill
      />
    </div>
  </article>
</template>

<style lang="scss" scoped>
// Cards sit on a grid of --columns-per-row columns (1rem apart, the dashboard's gap); a card spans
// --card-columns of them.
.dashboard-card {
  // The gap between chart columns that keeps them on the grid: the dashboard's gap plus the
  // padding and borders of the two cards around it.
  --card-padding: 0.75rem;
  --chart-column-gap: calc(1rem + 2 * var(--card-padding) + 2px);

  display: flex;
  // Lets the chart area take its height from the card's width (cqw).
  container-type: inline-size;
  flex: 0 1
    calc(
      var(--card-columns) * 100% / var(--columns-per-row) - 1rem / var(--columns-per-row) *
        (var(--columns-per-row) - var(--card-columns))
    );
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
  max-width: 100%;
  padding: var(--card-padding);
  background: $card-background;
  border: 1px solid $card-border;
  border-radius: 6px;
}

header {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .move-buttons {
    display: inline-flex;
    gap: 0.5rem;
  }

  // Icon buttons as tall as the menu button next to them (see ActionMenu.vue).
  button.icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: calc(2rem + 2px);
    padding-right: 0.6rem;
    padding-left: 0.6rem;

    svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
  }

  h3 {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: 1rem;
    font-weight: 500;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

// One line on every card (a long player name is cut short), so cards keep the same height.
.card-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .player-select {
    min-width: 0;

    :deep(.toggle) {
      min-width: 0;
    }
  }

  .info {
    flex: none;
    margin-left: auto;
    white-space: nowrap;
    font-size: 0.8rem;
    opacity: 0.7;
  }
}

// The same height on every card: one chart column's width, so a one-column chart is square. The
// chart fills it, with whatever bars it has (a scatter's search and lasso) taking from the plot.
.chart-area {
  display: flex;
  flex-direction: column;
  height: calc(
    (100cqw - (var(--card-columns) - 1) * var(--chart-column-gap)) / var(--card-columns)
  );
}

.warning {
  margin: 0;
  color: #f2c94c;
  font-size: 0.8rem;
}

.hint {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 1rem;
  text-align: center;
  opacity: 0.7;
}
</style>
