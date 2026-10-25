<!--
  Mêlée en cours (étape 7, intégrée au HUD de l'étape 8) : décompte des joueurs de chaque équipe dans la zone, jauge
  partagée aux couleurs des équipes, temps restant de la phase (capture ou prolongation « premier qui mène »), « tu comptes ».
-->
<script lang="ts">
  import Icon from '../common/Icon.svelte';
  import { hud } from '../state/hud.svelte';

  const m = $derived(hud.snap?.match ?? null);
  const sc = $derived(m?.scrum ?? null);
  const pct = (x: number): string => `${Math.max(0, Math.min(1, x)) * 100}%`;
</script>

{#if m && sc}
  {@const total = sc.counts[0] + sc.counts[1]}
  <div class="scrum" class:ot={sc.overtime} class:low={(m.lastMinute && !m.training) || m.training} role="status">
    <span class="lbl"><Icon name="scrum" />{sc.overtime ? 'PROLONGATION' : 'MÊLÉE'}</span>
    <div class="cnt">
      <b class="c0">{sc.counts[0]}</b>
      <div class="split"><i style:width={pct(total > 0 ? sc.counts[0] / total : 0.5)}></i></div>
      <b class="c1">{sc.counts[1]}</b>
    </div>
    <div class="time"><i style:width={pct(1 - sc.progress)}></i></div>
    <span class="sub">
      {sc.overtime ? 'premier qui mène · ' : ''}{sc.secLeft.toFixed(1).replace('.', ',')} s
      {#if sc.inZone}<em>· tu comptes</em>{/if}
    </span>
  </div>
{/if}

<style>
  .scrum {
    position: absolute;
    left: 50%;
    top: 4.6rem;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.22rem;
    min-width: 13rem;
    padding: 0.4rem 0.9rem 0.45rem;
    border-radius: var(--r-md);
    background: var(--panel);
    box-shadow: inset 0 0 0 0.12rem rgb(255 255 255 / 0.22);
    color: #fff;
    pointer-events: none;
  }
  .scrum.low {
    top: 6rem;
  }
  .ot {
    box-shadow: inset 0 0 0 0.14rem #ffd23e;
  }
  .lbl {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font: italic 900 0.8rem/1 var(--font);
    letter-spacing: 0.16em;
  }
  .ot .lbl {
    color: #ffd23e;
  }
  .cnt {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }
  .cnt b {
    min-width: 1.1rem;
    text-align: center;
    font: 900 1.35rem/1 var(--font);
  }
  .c0 {
    color: var(--t0);
  }
  .c1 {
    color: var(--t1);
  }
  .split {
    flex: 1;
    height: 0.65rem;
    border-radius: 999px;
    background: var(--t1);
    overflow: hidden;
  }
  .split i {
    display: block;
    height: 100%;
    background: var(--t0);
    border-right: 0.15rem solid var(--ink);
    transition: width 0.15s;
  }
  .time {
    width: 100%;
    height: 0.25rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.16);
    overflow: hidden;
  }
  .time i {
    display: block;
    height: 100%;
    background: #fff;
  }
  .ot .time i {
    background: #ffd23e;
  }
  .sub {
    font: 700 0.72rem/1.2 var(--font);
    color: var(--text-dim);
  }
  .sub em {
    font-style: normal;
    color: var(--good);
  }
  @media (prefers-reduced-motion: no-preference) {
    .ot {
      animation: ot-pulse 0.35s ease-in-out infinite alternate;
    }
  }
  @keyframes ot-pulse {
    to {
      background: rgb(60 44 10 / 0.9);
    }
  }
</style>
