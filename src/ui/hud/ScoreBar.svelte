<!--
  Score et chrono, au centre en haut (étape 8) : blocs inclinés aux couleurs des équipes (« TOI » sous l'équipe du joueur),
  chrono m:ss (au dixième dans les dernières secondes), dernière minute en rouge pulsant, entraînement indiqué (∞).
  Passe finale : « TOI » hors du bloc biseauté (le clip-path le rognait entièrement) ; un score ne « saute » que s'il a
  changé depuis le montage.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { hud } from '../state/hud.svelte';

  const m = $derived(hud.snap?.match ?? null);
  const lastMinute = $derived(m !== null && m.lastMinute && !m.training);
  /** Score au montage du HUD : l'animation « score » ne joue que pour un score qui a changé depuis. */
  const score0 = untrack(() => (hud.snap === null ? null : ([...hud.snap.match.score] as const)));
  const popped = (team: 0 | 1, v: number): boolean => score0 === null || v !== score0[team];
</script>

{#if m}
  <div class="scorebar" class:last={lastMinute} class:urgent={m.clockUrgent}>
    <div class="wrap">
      <div class="team t0" class:mine={m.localTeam === 0}>
        <span class="name">{m.teamNames[0]}</span>
        {#key m.score[0]}<b class="score" class:pop={popped(0, m.score[0])}>{m.score[0]}</b>{/key}
      </div>
      {#if m.localTeam === 0}<span class="you">TOI</span>{/if}
    </div>
    <div class="clock" aria-label={m.training ? 'Entraînement : chrono figé' : `Temps restant ${m.clock}`}>
      {#if m.training}
        <span class="inf">∞</span>
      {:else}
        <span class="time">{m.clock}</span>
      {/if}
    </div>
    <div class="wrap">
      <div class="team t1" class:mine={m.localTeam === 1}>
        {#key m.score[1]}<b class="score" class:pop={popped(1, m.score[1])}>{m.score[1]}</b>{/key}
        <span class="name">{m.teamNames[1]}</span>
      </div>
      {#if m.localTeam === 1}<span class="you right">TOI</span>{/if}
    </div>
  </div>
  {#if m.training || lastMinute}
    <div class="tag" class:lm={lastMinute}>{m.training ? 'ENTRAÎNEMENT · CHRONO FIGÉ' : 'DERNIÈRE MINUTE'}</div>
  {/if}
{/if}

<style>
  .scorebar {
    position: absolute;
    left: 50%;
    top: 0.8rem;
    transform: translateX(-50%);
    display: flex;
    align-items: stretch;
    filter: drop-shadow(0 0.25rem 0 rgb(0 0 0 / 0.25));
    pointer-events: none;
  }
  /* Porte « TOI » hors du bloc biseauté (clip-path). */
  .wrap {
    position: relative;
    display: flex;
  }
  .team {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 8.5rem;
    padding: 0.2rem 1.1rem;
    color: #fff;
  }
  .t0 {
    justify-content: flex-end;
    background: var(--t0);
    clip-path: polygon(0.9rem 0, 100% 0, 100% 100%, 0 100%);
    border-radius: 0.6rem 0 0 0.6rem;
  }
  .t1 {
    justify-content: flex-start;
    background: var(--t1);
    clip-path: polygon(0 0, 100% 0, calc(100% - 0.9rem) 100%, 0 100%);
    border-radius: 0 0.6rem 0.6rem 0;
  }
  .name {
    font: italic 900 0.85rem/1 var(--font);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.92;
  }
  .score {
    min-width: 1.6em;
    text-align: center;
    font: italic 900 2.1rem/1.05 var(--font);
    text-shadow: 0 0.12rem 0 rgb(0 0 0 / 0.25);
  }
  /* Sous le bord EXTÉRIEUR du bloc : l'étiquette centrée sous le chrono (entraînement, dernière minute) reste dégagée. */
  .you {
    position: absolute;
    bottom: -1.05rem;
    left: 1.6rem;
    padding: 0.08rem 0.45rem;
    border-radius: 0 0 0.4rem 0.4rem;
    background: #fff;
    color: var(--ink);
    font: 900 0.6rem/1.2 var(--font);
    letter-spacing: 0.12em;
  }
  .you.right {
    left: auto;
    right: 1.6rem;
  }
  .clock {
    display: grid;
    place-items: center;
    min-width: 6.2rem;
    padding: 0 0.8rem;
    background: var(--ink);
    color: #fff;
    box-shadow: inset 0 -0.22rem 0 rgb(255 255 255 / 0.08);
  }
  .time {
    font: 900 1.75rem/1 var(--font);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  .inf {
    font: 900 2.1rem/1 var(--font);
    color: var(--cyan);
  }
  .last .clock {
    background: #c1123a;
  }
  .urgent .time {
    color: var(--accent);
  }
  .tag {
    position: absolute;
    left: 50%;
    top: 4.15rem;
    transform: translateX(-50%);
    padding: 0.15rem 0.7rem;
    border-radius: 0.4rem;
    background: var(--panel);
    color: var(--cyan);
    font: italic 900 0.7rem/1.3 var(--font);
    letter-spacing: 0.14em;
    white-space: nowrap;
    pointer-events: none;
  }
  .tag.lm {
    background: #c1123a;
    color: #fff;
  }
  @media (prefers-reduced-motion: no-preference) {
    .score.pop {
      animation: score-pop 0.45s cubic-bezier(0.2, 1.6, 0.4, 1);
    }
    .last .clock,
    .tag.lm {
      animation: lm-pulse 0.8s ease-in-out infinite alternate;
    }
    .urgent .time {
      animation: urgent 0.5s ease-in-out infinite alternate;
    }
  }
  @keyframes score-pop {
    from {
      transform: scale(1.7);
    }
  }
  @keyframes lm-pulse {
    to {
      background: #ff3d5a;
    }
  }
  @keyframes urgent {
    to {
      transform: scale(1.1);
    }
  }
</style>
