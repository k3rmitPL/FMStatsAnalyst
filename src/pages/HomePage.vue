<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { loadDemo } from '@/services/demo'
import { useLibraryStore } from '@/stores/library'

// Where the app is served from, for links to files in public/.
const BASE_URL = import.meta.env.BASE_URL

const router = useRouter()
const demoSection = ref(null)

// An in-page #demo link would be read as a route with hash URLs, so the button scrolls instead.
function scrollToDemo() {
  demoSection.value?.scrollIntoView({ behavior: 'smooth' })
}
const library = useLibraryStore()

const isLoadingDemo = ref(false)
const demoProgress = ref(0)
const demoMessage = ref('')
const demoError = ref('')

async function startDemo() {
  isLoadingDemo.value = true
  demoError.value = ''
  try {
    const { importId, viewId } = await loadDemo(library, (percent, message) => {
      demoProgress.value = percent
      demoMessage.value = message
    })
    const query = { import: importId }
    if (viewId) query.view = viewId
    router.push({ path: '/analyse', query })
  } catch (error) {
    demoError.value = `The demo could not be loaded: ${error.message}`
  } finally {
    isLoadingDemo.value = false
  }
}
</script>

<template>
  <div class="home">
    <section class="hero">
      <p class="eyebrow">Scouting toolkit for Football Manager</p>
      <h1>FM Stats Analyst</h1>
      <p class="lead">
        Turn a player export from Football Manager into your own scouting table. Build ratings from
        the stats that matter to you, filter players by position and compare them side by side.
      </p>
      <div class="hero-actions">
        <button type="button" class="button primary" @click="scrollToDemo">Try the demo</button>
        <RouterLink class="button" to="/analyse">Use your own data</RouterLink>
      </div>
    </section>

    <section class="features" aria-label="What it does">
      <article class="feature">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h16v16H4zM4 9h16M9 9v11" />
        </svg>
        <h2>Your data, your browser</h2>
        <p>
          Load CSV exports from your save. Everything is stored in this browser; nothing is uploaded
          anywhere.
        </p>
      </article>
      <article class="feature">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 19V9M12 19V5M19 19v-7M3 19h18" />
        </svg>
        <h2>Custom metrics</h2>
        <p>
          Combine stats into your own ratings with a drag-and-drop formula editor, scale them to
          0-100 and colour them from red to green.
        </p>
      </article>
      <article class="feature">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16M7 12h10M10 19h4" />
        </svg>
        <h2>Views like in the game</h2>
        <p>
          Pick and order columns, filter by positions on a pitch and by conditions, then save the
          setup as a view and share it as a file.
        </p>
      </article>
      <article class="feature">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.5-4.5" />
        </svg>
        <h2>Spot your players</h2>
        <p>
          Search across all columns, sort by any stat and highlight the players of your own team in
          the table.
        </p>
      </article>
    </section>

    <section class="steps">
      <h2>How to start</h2>
      <ol>
        <li>
          <strong>Get the view.</strong> Download the
          <a :href="`${BASE_URL}data/Full%20Export%20View.fmf`" download>Full Export View</a>
          and import it in Football Manager. It includes most player stats.
        </li>
        <li>
          <strong>Export your players.</strong> Use
          <a href="https://github.com/ElectroHugin/FM-View-Exporter" target="_blank" rel="noopener"
            >FM View Exporter</a
          >
          to save the players shown in that view to a CSV file. Set
          <code>ScanColumns = true</code> in the plugin's config first.
        </li>
        <li>
          <strong>Load the file.</strong> On the
          <RouterLink to="/analyse">Analyse</RouterLink> page, choose <em>Load CSV...</em> and pick
          your export.
        </li>
        <li>
          <strong>Create metrics.</strong> On the
          <RouterLink to="/metrics">Metrics</RouterLink> page, build ratings from the columns of
          your export. They appear as extra columns in the table.
        </li>
        <li>
          <strong>Save views.</strong> Set up the columns, open <em>Filters</em> for positions and
          conditions, then save the layout from the menu next to it.
        </li>
      </ol>
    </section>

    <section ref="demoSection" class="demo">
      <div class="demo-text">
        <h2>Try the demo</h2>
        <p>
          Not ready to export your own save? Load sample players from European leagues at the end of
          the 2026/27 season, together with two shooting metrics (<em>Shots Index</em> and
          <em>Shots on Target Index</em>) and a <em>Best Shooters</em> view.
        </p>
        <p class="note">
          Loading the demo again resets those metrics and the view to their demo versions. The
          sample players are only added once.
        </p>
      </div>
      <div class="demo-action">
        <button v-if="!isLoadingDemo" type="button" class="primary" @click="startDemo">
          Load demo data
        </button>
        <template v-else>
          <progress :value="demoProgress" max="100"></progress>
          <span class="status">{{ demoMessage }}</span>
        </template>
        <p v-if="demoError" class="error">{{ demoError }}</p>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.home {
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
  padding: 1rem 0 3rem;
}

section + section {
  margin-top: 3rem;
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1.35rem;
  font-weight: 500;
}

// --- Hero ------------------------------------------------------------------

.hero {
  padding: 2.5rem 0 1rem;

  h1 {
    margin: 0 0 1rem;
    font-size: clamp(2.2rem, 5vw, 3.2rem);
    line-height: 1.1;
  }
}

.eyebrow {
  margin: 0 0 0.5rem;
  color: $accent-color;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lead {
  max-width: 40rem;
  margin: 0 0 1.75rem;
  font-size: 1.15rem;
  line-height: 1.6;
  opacity: 0.9;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

// Links styled like the app's buttons.
.button {
  @extend %btn;

  display: inline-block;
  padding: 0.6rem 1.1rem;
  font-weight: 500;

  &.primary {
    border-color: color.adjust($background-color, $lightness: 35%);
    background-color: color.adjust($background-color, $lightness: 15%);

    &:hover {
      background-color: color.adjust($background-color, $lightness: 20%);
    }
  }
}

// --- Features --------------------------------------------------------------

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));
  gap: 1rem;
}

.feature {
  padding: 1.25rem;
  background: $card-background;
  border: 1px solid $card-border;
  border-radius: 8px;

  svg {
    width: 26px;
    height: 26px;
    margin-bottom: 0.6rem;
    fill: none;
    stroke: $accent-color;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  h2 {
    margin-bottom: 0.4rem;
    font-size: 1.05rem;
  }

  p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    opacity: 0.85;
  }
}

// --- How to start ----------------------------------------------------------

.steps ol {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.steps li {
  position: relative;
  padding: 0.15rem 0 0 2.75rem;
  line-height: 1.6;
  counter-increment: step;

  // Numbered circles.
  &::before {
    content: counter(step);
    position: absolute;
    top: 0;
    left: 0;
    display: grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    color: $background-color;
    font-size: 0.9rem;
    font-weight: 700;
    background: $accent-color;
    border-radius: 50%;
  }

  strong {
    font-weight: 500;
  }
}

// --- Demo ------------------------------------------------------------------

.demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem 2.5rem;
  padding: 1.5rem;
  background: linear-gradient(
    135deg,
    color.adjust($accent-color, $alpha: -0.84),
    color.adjust($background-color, $lightness: 3%) 60%
  );
  border: 1px solid color.adjust($accent-color, $alpha: -0.65);
  border-radius: 10px;
  scroll-margin-top: 1rem;
}

.demo-text {
  flex: 1 1 26rem;

  p {
    margin: 0 0 0.6rem;
    line-height: 1.6;
  }

  .note {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.7;
  }
}

.demo-action {
  display: flex;
  flex: 0 1 16rem;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;

  button {
    padding: 0.7rem 1.2rem;
    font-weight: 500;
  }

  progress {
    width: 100%;
  }

  .status {
    font-size: 0.85rem;
    opacity: 0.85;
  }

  .error {
    margin: 0;
    color: #ff8a8a;
    font-size: 0.85rem;
  }
}
</style>
