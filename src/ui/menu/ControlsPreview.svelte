<!--
  Aperçu des contrôles du menu de lancement (étape 8) : les actions principales, au clavier/souris ET à la manette
  (glyphes de la famille détectée), lues dans keymap.ts / gamepadMap.ts. Le panneau complet : ControlsPanel.
-->
<script lang="ts">
  import Glyph from '../common/Glyph.svelte';
  import Icon from '../common/Icon.svelte';
  import { CONTROLS, keyGlyphs, padGlyphs, type ControlId } from '../logic/controlHints';
  import { app } from '../state/app.svelte';

  const IDS: readonly ControlId[] = ['move', 'look', 'fire', 'dodge', 'jump', 'pass', 'ability'];
</script>

<div class="preview">
  <div class="cols" aria-hidden="true">
    <span></span>
    <span class:active={app.device === 'keyboard'}><Icon name="keyboard" /> Clavier</span>
    <span class:active={app.device === 'gamepad'}><Icon name="gamepad" /> Manette</span>
  </div>
  {#each IDS as id (id)}
    <div class="row">
      <span class="lbl">{CONTROLS[id].label}</span>
      <span class="g">{#each keyGlyphs(id, app.layout) as g, i (i)}<Glyph {g} size="sm" />{/each}</span>
      <span class="g">{#each padGlyphs(id, app.padStyle) as g, i (i)}<Glyph {g} size="sm" />{/each}</span>
    </div>
  {/each}
</div>

<style>
  .preview {
    display: grid;
    gap: 0.28rem;
    padding: 0.7rem 0.85rem;
    border-radius: var(--r-lg);
    background: var(--panel);
    box-shadow: inset 0 0 0 0.1rem var(--stroke);
    font-size: 0.95rem;
  }
  .cols,
  .row {
    display: grid;
    grid-template-columns: 1fr 6.4rem 5.2rem;
    align-items: center;
    gap: 0.5rem;
  }
  .cols span {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font: 900 0.62rem/1 var(--font);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .cols span.active {
    color: var(--accent);
  }
  .lbl {
    font: 700 0.76rem/1.2 var(--font);
    color: var(--text-dim);
  }
  .g {
    display: flex;
    gap: 0.15rem;
    flex-wrap: nowrap;
  }
</style>
