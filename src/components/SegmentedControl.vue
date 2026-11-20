<script setup>
// A row of joined toggle buttons, one of which is selected.
defineProps({
  // [{ value, label }]
  options: { type: Array, required: true },
  // Accessible name of the group.
  label: { type: String, default: undefined },
})

const selected = defineModel({ required: true })
</script>

<template>
  <div class="segmented" role="group" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="short"
      :class="{ active: selected === o.value }"
      :aria-pressed="selected === o.value"
      @click="selected = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style lang="scss" scoped>
.segmented {
  display: inline-flex;

  button {
    border-radius: 0;

    &:first-child {
      border-radius: 4px 0 0 4px;
    }

    &:last-child {
      border-radius: 0 4px 4px 0;
    }

    &.active {
      color: $accent-color;
    }
  }
}
</style>
