<!--
  Outils d'entraînement (?debug ou mode entraînement), en haut à gauche : ballon pour moi / ballon au centre, avec les
  touches ou boutons du périphérique actif.
-->
<script lang="ts">
  import Glyph from '../common/Glyph.svelte';
  import { controlGlyphs } from '../logic/controlHints';
  import { app } from '../state/app.svelte';
</script>

<div class="tools">
  <span class="title">Outils</span>
  <span class="row">{#each controlGlyphs('giveBall', app.device, app.padStyle, app.layout) as g, i (i)}<Glyph {g} size="sm" />{/each} ballon pour moi</span>
  <span class="row">{#each controlGlyphs('resetBall', app.device, app.padStyle, app.layout) as g, i (i)}<Glyph {g} size="sm" />{/each} ballon au centre</span>
</div>

<style>
  .tools {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.45rem 0.7rem;
    border-radius: var(--r-md);
    background: var(--panel);
    color: var(--text-dim);
    font: 700 0.75rem/1.2 var(--font);
    pointer-events: none;
  }
  .title {
    font: italic 900 0.68rem/1 var(--font);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--cyan);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.95em;
  }
</style>
