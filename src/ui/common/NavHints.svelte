<!--
  Aide de navigation en bas des menus (étape 8) : « A Valider · B Retour » à la manette (glyphes de la famille
  détectée), « ↑↓ Naviguer · Entrée Valider · Échap Retour » au clavier. Les boutons viennent de DEFAULT_MENU_PAD_MAP.
-->
<script lang="ts">
  import { DEFAULT_MENU_PAD_MAP, type MenuPadMap } from '../../input/gamepadMap';
  import { padButtonGlyph } from '../logic/controlHints';
  import { app } from '../state/app.svelte';
  import Glyph from './Glyph.svelte';

  /** Une aide : bouton de manette et / ou touche (absent : l'aide n'est pas montrée pour ce périphérique). */
  type Hint = { pad?: keyof MenuPadMap; key?: string; label: string };
  let { hints }: { hints: readonly Hint[] } = $props();
</script>

<div class="hints" aria-hidden="true">
  {#if app.device === 'keyboard'}
    <span class="h"><Glyph g={{ kind: 'key', label: '↑↓←→' }} size="sm" /> Naviguer</span>
  {:else}
    <span class="h"><Glyph g={padButtonGlyph(DEFAULT_MENU_PAD_MAP.down, app.padStyle)} size="sm" /> Naviguer</span>
  {/if}
  {#each hints as h (h.label)}
    {#if app.device === 'gamepad' && h.pad !== undefined}
      <span class="h"><Glyph g={padButtonGlyph(DEFAULT_MENU_PAD_MAP[h.pad], app.padStyle)} size="sm" /> {h.label}</span>
    {:else if app.device === 'keyboard' && h.key !== undefined}
      <span class="h"><Glyph g={{ kind: 'key', label: h.key }} size="sm" /> {h.label}</span>
    {/if}
  {/each}
</div>

<style>
  .hints {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.1rem;
    font: 800 0.75rem/1 var(--font);
    color: var(--text-dim);
  }
  .h {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.95em;
  }
</style>
