<!--
  Pastille radiale d'une action (étape 8) : icône, anneau de progression (recharge ou durée active), secondes restantes,
  touche ou bouton du périphérique actif, libellé. États : prête (vive, éclat au moment où elle redevient prête), en
  recharge (assombrie), active (anneau qui se vide, halo), indisponible (barrée).
-->
<script lang="ts">
  import Glyph from '../common/Glyph.svelte';
  import Icon, { type IconName } from '../common/Icon.svelte';
  import type { GlyphSpec } from '../logic/controlHints';

  let {
    icon,
    label,
    glyphs,
    remaining = 0,
    total = 1,
    activeFrac = -1,
    blocked = false,
    sub = '',
    subTone = 'default',
    tone = 'default',
  }: {
    icon: IconName;
    label: string;
    glyphs: GlyphSpec[];
    /** Recharge restante (s). */
    remaining?: number;
    /** Recharge totale (s). */
    total?: number;
    /** Capacité active : fraction de durée restante (0..1), −1 sinon. */
    activeFrac?: number;
    /** Action impossible pour l'instant (pas de cible de passe, plongeon en cours…). */
    blocked?: boolean;
    sub?: string;
    /** Couleur du texte secondaire : risque de la passe (passe finale). */
    subTone?: 'default' | 'risky' | 'marked';
    tone?: 'default' | 'ball' | 'ability';
  } = $props();

  /** Circonférence de l'anneau (r = 21 dans un viewBox de 48). */
  const C = 2 * Math.PI * 21;
  const active = $derived(activeFrac >= 0);
  const cooling = $derived(!active && remaining > 0.05);
  const ready = $derived(!active && !cooling && !blocked);
  const progress = $derived(active ? activeFrac : cooling ? 1 - remaining / Math.max(0.01, total) : 1);
  const secText = $derived(remaining >= 10 ? String(Math.ceil(remaining)) : remaining.toFixed(1).replace('.', ','));
</script>

<div class="pill {tone}" class:ready class:cooling class:active class:blocked>
  <div class="disc">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle class="track" cx="24" cy="24" r="21" />
      <circle class="ring" cx="24" cy="24" r="21" stroke-dasharray={C} stroke-dashoffset={C * (1 - Math.max(0, Math.min(1, progress)))} />
    </svg>
    <span class="ico"><Icon name={icon} size="1.45rem" /></span>
    {#if cooling}<span class="sec">{secText}</span>{/if}
    {#if ready}<i class="burst"></i>{/if}
    <span class="keys">
      {#each glyphs as g, i (i)}<Glyph {g} size="sm" />{/each}
    </span>
  </div>
  <span class="lbl">{label}</span>
  {#if sub}<span class="sub" class:risky={subTone === 'risky'} class:marked={subTone === 'marked'}>{sub}</span>{/if}
</div>

<style>
  .pill {
    --ring: #ffffff;
    --glow: rgb(255 255 255 / 0.35);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    min-width: 4.6rem;
    max-width: 7.2rem;
    color: #fff;
  }
  .pill.ability {
    --ring: var(--good);
    --glow: rgb(61 255 160 / 0.45);
  }
  .pill.ball {
    --ring: var(--accent);
    --glow: rgb(255 225 46 / 0.45);
  }
  .disc {
    position: relative;
    width: 3.3rem;
    height: 3.3rem;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #2c2766, #15123a 75%);
    box-shadow: 0 0.2rem 0 rgb(0 0 0 / 0.35);
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .track {
    fill: none;
    stroke: rgb(255 255 255 / 0.13);
    stroke-width: 4;
  }
  .ring {
    fill: none;
    stroke: var(--ring);
    stroke-width: 4;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.1s linear;
  }
  .ico {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    --icon-cut: #15123a;
  }
  .cooling .ico {
    opacity: 0.28;
  }
  .cooling .ring {
    stroke: rgb(255 255 255 / 0.55);
  }
  .sec {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font: 900 1.05rem/1 var(--font);
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0.1rem 0.2rem #000;
  }
  .ready .disc {
    box-shadow:
      0 0.2rem 0 rgb(0 0 0 / 0.35),
      0 0 0.7rem var(--glow);
  }
  .active .disc {
    background: radial-gradient(circle at 40% 35%, #1f7a55, #0f3b2c 75%);
    box-shadow:
      0 0.2rem 0 rgb(0 0 0 / 0.35),
      0 0 1rem var(--glow);
  }
  .blocked .ico {
    opacity: 0.35;
  }
  .blocked .ring {
    stroke: rgb(255 255 255 / 0.25);
  }
  .burst {
    position: absolute;
    inset: -0.2rem;
    border-radius: 50%;
    border: 0.18rem solid var(--ring);
    opacity: 0;
    pointer-events: none;
  }
  .keys {
    position: absolute;
    left: 50%;
    bottom: -0.55rem;
    transform: translateX(-50%);
    display: flex;
    gap: 0.1rem;
    font-size: 0.95rem;
    white-space: nowrap;
  }
  .lbl {
    margin-top: 0.5rem;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0.06rem 0.4rem;
    border-radius: 999px;
    background: rgb(15 13 43 / 0.72);
    font: 800 0.75rem/1.15 var(--font);
    letter-spacing: 0.02em;
  }
  .cooling .lbl,
  .blocked .lbl {
    color: var(--text-dim);
  }
  /* Passe finale : 0,6 -> 0,78 rem (la cible de passe faisait 8 px en 1280×720, illisible en courant). */
  .sub {
    max-width: 8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
    white-space: nowrap;
    padding: 0.04rem 0.35rem;
    border-radius: 999px;
    background: rgb(15 13 43 / 0.72);
    font: 800 0.78rem/1.15 var(--font);
    color: var(--text-dim);
  }
  .sub.risky {
    color: #ffc23d;
  }
  .sub.marked {
    color: #fff;
    background: #d8401c;
  }
  @media (prefers-reduced-motion: no-preference) {
    .burst {
      animation: burst 0.45s ease-out;
    }
    .active .disc {
      animation: active-pulse 0.5s ease-in-out infinite alternate;
    }
  }
  @keyframes burst {
    from {
      opacity: 0.95;
      transform: scale(0.85);
    }
    to {
      opacity: 0;
      transform: scale(1.35);
    }
  }
  @keyframes active-pulse {
    to {
      box-shadow:
        0 0.2rem 0 rgb(0 0 0 / 0.35),
        0 0 0.35rem var(--glow);
    }
  }
</style>
