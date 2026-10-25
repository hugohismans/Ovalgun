<!--
  Glyphe d'une touche, d'un bouton de souris, d'un bouton de manette (Xbox / PlayStation) ou d'un stick (étape 8).
  Dessiné en CSS / SVG (pas d'image) : boutons de façade ronds et colorés, gâchettes et bumpers en pastilles, croix
  directionnelle, touche de clavier en relief. `title` = le libellé (lecteurs d'écran : aria-label).
-->
<script lang="ts">
  import type { GlyphSpec } from '../logic/controlHints';

  let { g, size = 'md' }: { g: GlyphSpec; size?: 'sm' | 'md' | 'lg' } = $props();

  /** Couleur des boutons de façade (index standard 0..3). */
  const FACE_COLORS: Record<string, readonly string[]> = {
    xbox: ['#62c84a', '#ef3f4a', '#3a8dff', '#ffc21a'],
    playstation: ['#8fa8ff', '#ff6b80', '#f08ee0', '#45dcae'],
  };
  /** Bras éclairé de la croix directionnelle (index 12..15 : haut, bas, gauche, droite). */
  const DPAD_ARM: Record<number, string> = { 12: 'M9 2h6v7H9z', 13: 'M9 15h6v7H9z', 14: 'M2 9h7v6H2z', 15: 'M15 9h7v6h-7z' };

  const padKind = $derived(
    g.kind !== 'pad' ? '' : g.index <= 3 ? 'face' : g.index <= 5 ? 'bumper' : g.index <= 7 ? 'trigger' : g.index <= 9 ? 'menu' : g.index <= 11 ? 'thumb' : g.index <= 15 ? 'dpad' : 'home',
  );
</script>

{#if g.kind === 'key'}
  <kbd class="glyph key {size}" class:wide={g.label.length > 2} aria-label={g.label} title={g.label}>{g.label}</kbd>
{:else if g.kind === 'mouse'}
  <span class="glyph mouse {size}" role="img" aria-label={g.label} title={g.label}>
    <svg viewBox="0 0 16 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="21" rx="6.5" class="body" />
      <path d="M8 1.5v8.5" class="seam" />
      {#if g.button === 0}<path d="M8 1.5A6.5 6.5 0 0 0 1.5 8v2H8z" class="hot" />{/if}
      {#if g.button === 2}<path d="M8 1.5A6.5 6.5 0 0 1 14.5 8v2H8z" class="hot" />{/if}
      {#if g.button === 1}<rect x="6.6" y="4" width="2.8" height="5" rx="1.4" class="hot" />{/if}
      {#if g.button < 0}<path d="M8 13v6M5.5 16h5" class="seam" />{/if}
    </svg>
  </span>
{:else if g.kind === 'stick'}
  <span class="glyph stick {size}" role="img" aria-label={g.label} title={g.label}><b>{g.side}</b></span>
{:else if padKind === 'face'}
  <span class="glyph face {size} {g.style}" role="img" aria-label={g.label} title={g.label} style:--fc={FACE_COLORS[g.style][g.index]}>
    {#if g.style === 'playstation'}
      <svg viewBox="0 0 20 20" aria-hidden="true">
        {#if g.index === 0}<path d="M5 5l10 10M15 5L5 15" />{/if}
        {#if g.index === 1}<circle cx="10" cy="10" r="5.2" />{/if}
        {#if g.index === 2}<rect x="5" y="5" width="10" height="10" />{/if}
        {#if g.index === 3}<path d="M10 4.5l6 10.5H4z" />{/if}
      </svg>
    {:else}
      <b>{g.label}</b>
    {/if}
  </span>
{:else if padKind === 'dpad'}
  <span class="glyph dpad {size}" role="img" aria-label="croix {g.label}" title="croix {g.label}">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" class="body" />
      <path d={DPAD_ARM[g.index] ?? ''} class="hot" />
    </svg>
  </span>
{:else if g.kind === 'pad'}
  <span class="glyph pill {padKind} {size}" role="img" aria-label={g.label} title={g.label}>{g.label}</span>
{/if}

<style>
  .glyph {
    --s: 1.7em;
    display: inline-grid;
    place-items: center;
    flex: none;
    min-width: var(--s);
    height: var(--s);
    box-sizing: border-box;
    vertical-align: middle;
    font: 800 0.8em/1 var(--font);
    font-style: normal;
    color: #fff;
    letter-spacing: 0;
  }
  .glyph.sm {
    --s: 1.45em;
    font-size: 0.75em;
  }
  .glyph.lg {
    --s: 2.1em;
  }
  .key {
    padding: 0 0.45em;
    border-radius: 0.38em;
    background: linear-gradient(#ffffff, #e4e2f5);
    color: #1b1838;
    box-shadow:
      0 0.14em 0 #a9a5cf,
      0 0.18em 0.3em #0006;
    font-weight: 900;
    font-family: var(--font);
    transform: translateY(-0.07em);
  }
  .key.wide {
    padding: 0 0.55em;
    font-size: 0.72em;
  }
  .mouse svg {
    height: 100%;
    width: auto;
  }
  .mouse .body {
    fill: #fff;
    stroke: #1b1838;
    stroke-width: 1.4;
  }
  .mouse .seam {
    stroke: #1b1838;
    stroke-width: 1.2;
    fill: none;
  }
  .mouse .hot {
    fill: var(--accent);
    stroke: #1b1838;
    stroke-width: 1.2;
  }
  .face {
    width: var(--s);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #3a3664, #15132c 70%);
    box-shadow:
      inset 0 0 0 0.11em #ffffff30,
      0 0.12em 0.25em #0008;
    color: var(--fc);
  }
  .face b {
    font: 900 1em/1 var(--font);
    color: var(--fc);
  }
  .face svg {
    width: 62%;
    height: 62%;
    fill: none;
    stroke: var(--fc);
    stroke-width: 2.4;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .pill {
    padding: 0 0.42em;
    border-radius: 0.5em;
    background: linear-gradient(#3a3664, #1a1834);
    box-shadow:
      inset 0 0 0 0.1em #ffffff38,
      0 0.12em 0.25em #0008;
    font-size: 0.72em;
    font-weight: 900;
  }
  .pill.trigger {
    border-radius: 0.5em 0.5em 0.75em 0.75em;
    height: calc(var(--s) * 1.12);
  }
  .pill.menu {
    font-size: 0.62em;
    border-radius: 999px;
  }
  .pill.thumb,
  .stick {
    width: var(--s);
    border-radius: 50%;
  }
  .stick {
    background: radial-gradient(circle, #3a3664 45%, #15132c 47%, #15132c 62%, #ffffff30 64%, #15132c 70%);
    box-shadow: 0 0.12em 0.25em #0008;
  }
  .stick b {
    font: 900 0.85em/1 var(--font);
  }
  .dpad {
    width: var(--s);
  }
  .dpad svg {
    width: 100%;
    height: 100%;
  }
  .dpad .body {
    fill: #1a1834;
    stroke: #ffffff50;
    stroke-width: 1;
  }
  .dpad .hot {
    fill: var(--accent);
  }
</style>
