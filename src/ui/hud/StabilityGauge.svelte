<!--
  Jauge de stabilité du joueur local (étape 8), grosse, en bas au centre : couleur selon le niveau (vert, jaune, rouge),
  traînée blanche de la perte récente, tremblement + flash à chaque tir reçu, « PLAQUÉ » avec le temps avant le relevé
  (et sa progression), invulnérabilité visible (liseré blanc + étiquette), régénération signalée.
-->
<script lang="ts">
  import Icon from '../common/Icon.svelte';
  import { hud } from '../state/hud.svelte';

  const s = $derived(hud.snap);
  const frac = $derived(s === null ? 1 : Math.max(0, Math.min(1, s.stability / s.stabilityMax)));
  /** Couleur selon les seuils de la session (STYLE.stabilityBarLowFraction / stabilityBarMidFraction) : rouge, jaune, vert. */
  const level = $derived(s === null ? 'high' : s.stabilityLow ? 'low' : s.stabilityMid ? 'mid' : 'high');
  const down = $derived(s !== null && s.status !== 'active');
  const getUp = $derived(s === null || s.statusTotalSec <= 0 ? 0 : 1 - s.statusSec / s.statusTotalSec);
  const sec = (v: number): string => v.toFixed(1).replace('.', ',');
  const seq = $derived(s?.combat.hitTakenSeq ?? 0);
</script>

{#if s}
  <div class="gauge {level}" class:down class:invuln={s.invulnSec > 0 && !down}>
    <div class="head">
      <span class="lbl">Stabilité</span>
      {#if s.invulnSec > 0 && !down}
        <span class="chip inv"><Icon name="shield" /> INVULNÉRABLE</span>
      {:else if s.regenerating}
        <span class="chip regen">+ récupération</span>
      {/if}
      <b class="num">{down ? 0 : Math.max(0, Math.ceil(s.stability))}</b>
    </div>
    <!-- Deux animations identiques alternées : le tremblement repart à chaque tir sans recréer la barre (traînée). -->
    <div class="shake" class:hit-a={seq > 0 && seq % 2 === 1} class:hit-b={seq > 0 && seq % 2 === 0}>
    <div class="bar">
      <div class="lag" style:width="{frac * 100}%"></div>
      <div class="fill" style:width="{frac * 100}%"></div>
      <div class="ticks"></div>
      {#key seq}{#if seq > 0}<div class="flash"></div>{/if}{/key}
      {#if down}
        <div class="tackled">
          <div class="getup" style:width="{getUp * 100}%"></div>
          <span>{s.status === 'down' ? 'PLAQUÉ' : 'RELEVÉ…'}<em>{sec(s.statusSec)} s</em></span>
        </div>
      {/if}
    </div>
    </div>
  </div>
{/if}

<style>
  .gauge {
    --fill: #3dffa0;
    width: min(26rem, 46vw);
    color: #fff;
    pointer-events: none;
  }
  .gauge.mid {
    --fill: #ffe12e;
  }
  .gauge.low {
    --fill: #ff4466;
  }
  .head {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    margin: 0 0.4rem 0.2rem;
  }
  .lbl {
    padding: 0.18rem 0.5rem;
    border-radius: 999px;
    background: rgb(15 13 43 / 0.72);
    font: italic 900 0.8rem/1 var(--font);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    text-shadow:
      0 0 0.15rem #000,
      0 0.1rem 0.3rem rgb(0 0 0 / 0.8);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    font: 900 0.62rem/1.2 var(--font);
    letter-spacing: 0.08em;
  }
  .chip.inv {
    background: #fff;
    color: var(--ink);
  }
  .chip.regen {
    background: rgb(61 255 160 / 0.2);
    color: var(--good);
  }
  .num {
    margin-left: auto;
    font: italic 900 1.7rem/0.9 var(--font);
    font-variant-numeric: tabular-nums;
    text-shadow:
      0 0 0.2rem #000,
      0 0.12rem 0 rgb(0 0 0 / 0.5);
  }
  .low .num {
    color: #ff6b84;
  }
  .bar {
    position: relative;
    height: 1.25rem;
    border-radius: 0.45rem;
    background: rgb(15 13 43 / 0.82);
    /* Contour sombre extérieur : la barre pleine (vert menthe) reste lisible sur l'herbe. */
    box-shadow:
      inset 0 0 0 0.16rem rgb(255 255 255 / 0.18),
      0 0 0 0.14rem rgb(15 13 43 / 0.9),
      0 0.25rem 0 0.14rem rgb(0 0 0 / 0.3);
    overflow: hidden;
    transform: skewX(-14deg);
  }
  .invuln .bar {
    box-shadow:
      inset 0 0 0 0.2rem #fff,
      0 0 0 0.14rem rgb(15 13 43 / 0.9),
      0 0 1rem rgb(255 255 255 / 0.7);
  }
  .fill,
  .lag {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
  }
  .fill {
    background: linear-gradient(180deg, color-mix(in srgb, var(--fill) 70%, #fff), var(--fill) 55%);
    transition:
      width 0.08s linear,
      background 0.25s;
  }
  .lag {
    background: #fff;
    opacity: 0.85;
    transition: width 0.45s ease-in 0.3s;
  }
  .ticks {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 0.12rem), rgb(15 13 43 / 0.55) calc(10% - 0.12rem) 10%);
  }
  .tackled {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: #c1123a;
  }
  .getup {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: rgb(255 255 255 / 0.28);
  }
  .tackled span {
    position: relative;
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    transform: skewX(14deg);
    font: italic 900 0.95rem/1 var(--font);
    letter-spacing: 0.16em;
  }
  .tackled em {
    font-style: normal;
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
  }
  .flash {
    position: absolute;
    inset: 0;
    background: #fff;
    opacity: 0;
    animation: flash 0.22s ease-out;
  }
  @media (prefers-reduced-motion: no-preference) {
    .low .bar {
      animation: low-glow 0.55s ease-in-out infinite alternate;
    }
    .shake.hit-a {
      animation: shake-a 0.26s ease-out;
    }
    .shake.hit-b {
      animation: shake-b 0.26s ease-out;
    }
    .invuln .bar {
      animation: inv 0.25s ease-in-out infinite alternate;
    }
  }
  @keyframes flash {
    from {
      opacity: 0.75;
    }
  }
  @keyframes shake-a {
    0% {
      transform: translate(0.5rem, -0.12rem);
    }
    25% {
      transform: translate(-0.42rem, 0.1rem);
    }
    50% {
      transform: translate(0.3rem, 0);
    }
    75% {
      transform: translate(-0.15rem, 0);
    }
  }
  @keyframes shake-b {
    0% {
      transform: translate(0.5rem, -0.12rem);
    }
    25% {
      transform: translate(-0.42rem, 0.1rem);
    }
    50% {
      transform: translate(0.3rem, 0);
    }
    75% {
      transform: translate(-0.15rem, 0);
    }
  }
  @keyframes low-glow {
    to {
      box-shadow:
        inset 0 0 0 0.18rem #ff4466,
        0 0 1.1rem rgb(255 68 102 / 0.75);
    }
  }
  @keyframes inv {
    to {
      box-shadow:
        inset 0 0 0 0.2rem #fff,
        0 0 0.3rem rgb(255 255 255 / 0.3);
    }
  }
</style>
