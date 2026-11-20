<script setup>
// Positions laid out on a pitch, each a toggle button. Players who can play any selected position
// match; none selected = everyone. Positions the dataset has no column for are greyed out.
import { computed } from 'vue'

// Positions laid out like a pitch, attack at the top.
const PITCH = [
  ['STL', 'STC', 'STR'],
  ['AML', 'AMC', 'AMR'],
  ['ML', 'MC', 'MR'],
  ['WBL', 'DM', 'WBR'],
  ['DL', 'DC', 'DR'],
  [null, 'GK', null],
]

const props = defineProps({
  columnInfo: { type: Object, default: () => ({}) },
  // Show the explanations above the pitch.
  hints: { type: Boolean, default: true },
  // Shows the positions without letting them be changed (e.g. positions taken from elsewhere).
  disabled: { type: Boolean, default: false },
})

const positions = defineModel({ type: Array, required: true })

// Positions the dataset has a true/false column for (split from its Position column on import).
const availablePositions = computed(
  () => new Set(PITCH.flat().filter((pos) => pos && props.columnInfo[pos]?.type === 'boolean')),
)

function togglePosition(position) {
  if (props.disabled || !availablePositions.value.has(position)) return
  positions.value = positions.value.includes(position)
    ? positions.value.filter((p) => p !== position)
    : [...positions.value, position]
}
</script>

<template>
  <div class="position-picker">
    <template v-if="hints">
      <p class="hint">Players who can play any selected position. None selected = everyone.</p>
      <p v-if="!availablePositions.size" class="hint unavailable">
        This dataset has no Position column, so players can't be filtered by position.
      </p>
      <p v-else-if="availablePositions.size < 16" class="hint unavailable">
        Greyed-out positions are not in this dataset.
      </p>
    </template>
    <div
      class="pitch"
      :class="{ disabled: !availablePositions.size, readonly: disabled }"
      :aria-disabled="disabled || undefined"
    >
      <template v-for="(line, r) in PITCH" :key="r">
        <template v-for="(pos, c) in line" :key="`${r}-${c}`">
          <button
            v-if="pos"
            type="button"
            class="position"
            :class="{ active: positions.includes(pos), unavailable: !availablePositions.has(pos) }"
            :aria-pressed="positions.includes(pos)"
            :disabled="disabled || !availablePositions.has(pos)"
            :title="availablePositions.has(pos) ? '' : 'Not in this dataset'"
            @click="togglePosition(pos)"
          >
            {{ pos }}
          </button>
          <span v-else></span>
        </template>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.hint {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  opacity: 0.7;
}

.hint.unavailable {
  color: #f2c94c;
  opacity: 1;
}

.pitch.disabled {
  opacity: 0.6;
}

// Shown, not editable: the selected positions stay visible, faded.
.pitch.readonly {
  opacity: 0.45;

  button.position {
    cursor: default;

    // Faded once, by the pitch (not again as disabled buttons); missing positions stay fainter.
    &:not(.unavailable) {
      opacity: 1;
    }
  }
}

.pitch {
  width: 14.7rem;
  display: grid;
  grid-template-columns: repeat(3, 4rem);
  gap: 0.35rem;
  padding: 0.75rem;
  background: rgba(47, 158, 110, 0.12);
  border: 1px solid rgba(47, 158, 110, 0.4);
  border-radius: 6px;
}

button.position {
  top: 0;
  left: 0;
  padding: 0.3rem 0;
  color: $text-color;
  font: inherit;
  font-size: 0.85rem;
  background-color: color.adjust($background-color, $lightness: 6%);
  border: 1px solid color.adjust($background-color, $lightness: 18%);
  border-radius: 4px;
  box-shadow: none;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: color.adjust($background-color, $lightness: 12%);
  }

  &.active,
  &.active:hover:not(:disabled) {
    background-color: color.adjust($accent-color, $lightness: -25%);
    border-color: $accent-color;
  }
}
</style>
