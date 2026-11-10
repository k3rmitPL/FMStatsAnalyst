<script setup>
import '@/assets/scss/app.scss'
</script>

<template>
  <nav id="main-nav">
    <RouterLink to="/" class="logo" aria-label="FM Stats Analyst home">
      <strong>FM</strong> Stats Analyst
    </RouterLink>
    <RouterLink to="/analyze">Analyze</RouterLink>
    <RouterLink to="/metrics">Metrics</RouterLink>
  </nav>

  <main>
    <RouterView />
  </main>
</template>

<style scoped lang="scss">
#main-nav {
  align-items: center;
}

// The id keeps these above the global `nav#main-nav a` link styles.
#main-nav .logo {
  font-size: 1.15rem;
  font-weight: 300;
  letter-spacing: 0.01em;
  opacity: 1;
  white-space: nowrap;

  strong {
    color: $accent-color;
    font-weight: 700;
  }
}

// On narrow screens the mark alone is enough.
@media (max-width: 480px) {
  .logo-text {
    display: none;
  }
}
</style>
