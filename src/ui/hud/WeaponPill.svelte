<!--
  Arme du joueur local (étape 8) : munitions (nombre + barre du chargeur), rechargement (barre de progression), touche
  de rechargement du périphérique actif ; porteur : « pas de tir » (le porteur ne tire pas).
-->
<script lang="ts">
  import Glyph from '../common/Glyph.svelte';
  import Icon from '../common/Icon.svelte';
  import type { GlyphSpec } from '../logic/controlHints';
  import { hud } from '../state/hud.svelte';

  let { reloadGlyphs }: { reloadGlyphs: GlyphSpec[] } = $props();

  const s = $derived(hud.snap);
  const reloading = $derived(s !== null && s.reloadProgress >= 0);
  const low = $derived(s !== null && !reloading && s.ammoLow);
</script>

{#if s}
  <div class="weapon" class:carrier={s.carrier} class:reloading class:low class:off={!s.canShoot && !s.carrier}>
    {#if s.carrier}
      <span class="ico"><Icon name="nofire" size="1.3rem" /></span>
      <span class="txt">Porteur<br /><small>pas de tir</small></span>
    {:else}
      <span class="ico"><Icon name={reloading ? 'reload' : 'ammo'} size="1.3rem" /></span>
      <div class="col">
        {#if reloading}
          <span class="txt">RECHARGE</span>
        {:else}
          <span class="count"><b>{s.ammo}</b><small>/{s.magazine}</small></span>
        {/if}
        <div class="bar">
          <i style:width="{(reloading ? s.reloadProgress : s.ammo / Math.max(1, s.magazine)) * 100}%"></i>
        </div>
      </div>
      {#if !reloading && s.ammo < s.magazine}
        <span class="key">{#each reloadGlyphs as g, i (i)}<Glyph {g} size="sm" />{/each}</span>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .weapon {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 7.6rem;
    height: 3.3rem;
    padding: 0 0.75rem;
    box-sizing: border-box;
    border-radius: 1.65rem;
    background: radial-gradient(circle at 30% 30%, #2c2766, #15123a 80%);
    box-shadow: 0 0.2rem 0 rgb(0 0 0 / 0.35);
    color: #fff;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
    min-width: 3.4rem;
  }
  .count b {
    font: italic 900 1.45rem/1 var(--font);
    font-variant-numeric: tabular-nums;
  }
  .count small {
    margin-left: 0.15rem;
    font: 800 0.75rem/1 var(--font);
    color: var(--text-dim);
  }
  .txt {
    font: italic 900 0.75rem/1.1 var(--font);
    letter-spacing: 0.08em;
  }
  .txt small {
    font: 700 0.62rem/1 var(--font);
    letter-spacing: 0;
    color: var(--text-dim);
  }
  .bar {
    height: 0.3rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.15);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: #fff;
    transition: width 0.08s linear;
  }
  .reloading .bar i {
    background: var(--accent);
  }
  .low .count b {
    color: #ff6b84;
  }
  .carrier,
  .off {
    opacity: 0.6;
  }
  .key {
    display: flex;
    font-size: 0.95rem;
  }
</style>
