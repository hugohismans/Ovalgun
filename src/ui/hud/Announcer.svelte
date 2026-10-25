<!--
  Grandes annonces centrales (étape 8) : compte à rebours du coup d'envoi (« 3, 2, 1 », équipe qui reçoit), « JOUEZ ! »,
  « ESSAI ! » (équipe, marqueur, score), « MÊLÉE ! », résultat de la mêlée, « DERNIÈRE MINUTE ». Lues dans le HUD de match
  (src/game/matchHud.ts) : rien n'est décidé ici.
-->
<script lang="ts">
  import { hud } from '../state/hud.svelte';

  const m = $derived(hud.snap?.match ?? null);
  const teamColor = (t: number): string => (t === 0 ? 'var(--t0)' : 'var(--t1)');
</script>

{#if m}
  <div class="announce" aria-live="polite">
    {#if m.tryBanner}
      {@const t = m.tryBanner}
      <div class="try" style:--tc={teamColor(t.team)}>
        <span class="big">ESSAI !</span>
        <span class="who">{t.mine ? 'Toi !' : t.scorerLabel} · {t.teamName}</span>
        <span class="sc"><b class="s0">{t.score[0]}</b><i>–</i><b class="s1">{t.score[1]}</b></span>
      </div>
    {:else if m.countdown > 0}
      <div class="count">
        {#key m.countdown}<span class="num">{m.countdown}</span>{/key}
        <span class="sub" style:--tc={teamColor(m.kickoffTeam)}>
          Coup d’envoi · <b>{m.teamNames[m.kickoffTeam]}</b>{m.kickoffTeam === m.localTeam ? ' (ton équipe)' : ''}
        </span>
      </div>
    {:else if m.scrumCall}
      <div class="call scrum">MÊLÉE !<span class="hint">entre dans la zone · plaque les adversaires dedans</span></div>
    {:else if m.playCall}
      <div class="call go">JOUEZ !</div>
    {/if}
    {#if m.scrumResult}
      {@const r = m.scrumResult}
      <div class="result" style:--tc={r.team === -1 ? '#ffffff' : teamColor(r.team)}>
        {#if r.team === -1}
          Mêlée : ballon rendu
        {:else}
          Mêlée gagnée par <b>{r.teamName}</b>{r.mine ? ' · ballon pour toi !' : r.ours ? ' (ton équipe)' : ''}
        {/if}
      </div>
    {/if}
    {#if m.lastMinuteBanner}
      <div class="lm">DERNIÈRE MINUTE<span>cooldowns raccourcis · ballon plus rapide</span></div>
    {/if}
  </div>
{/if}

<style>
  .announce {
    position: absolute;
    inset: 0;
    pointer-events: none;
    color: #fff;
    text-align: center;
  }
  .announce > * {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }
  .count,
  .call {
    top: 22%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-shadow:
      0 0.3rem 0 var(--ink),
      0 0 1.4rem rgb(15 13 43 / 0.7);
  }
  .num {
    font: italic 900 7rem/1 var(--font);
  }
  .sub {
    padding: 0.25rem 0.85rem;
    border-radius: var(--r-sm);
    background: var(--panel);
    font: 800 1rem/1.3 var(--font);
    text-shadow: none;
  }
  .sub b {
    color: var(--tc);
  }
  .call {
    font: italic 900 5rem/1 var(--font);
    white-space: nowrap;
  }
  .go {
    color: var(--good);
  }
  .scrum {
    color: #ffd23e;
  }
  .hint {
    padding: 0.25rem 0.85rem;
    border-radius: var(--r-sm);
    background: var(--panel);
    color: #fff;
    font: 800 0.95rem/1.3 var(--font);
    font-style: normal;
    text-shadow: none;
  }
  .try {
    top: 17%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.7rem 2.4rem 0.8rem;
    border-radius: var(--r-lg);
    background: var(--panel);
    box-shadow:
      inset 0 0 0 0.3rem var(--tc),
      0 0.5rem 0 rgb(0 0 0 / 0.25);
  }
  .try .big {
    font: italic 900 5rem/1 var(--font);
    color: var(--tc);
    text-shadow: 0.2rem 0.2rem 0 rgb(255 255 255 / 0.2);
  }
  .try .who {
    font: 800 1.2rem/1.2 var(--font);
  }
  .try .sc {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    font: 900 2rem/1.1 var(--font);
  }
  .try .sc i {
    opacity: 0.5;
    font-style: normal;
  }
  .s0 {
    color: var(--t0);
  }
  .s1 {
    color: var(--t1);
  }
  .result {
    top: 31%;
    padding: 0.5rem 1.4rem;
    border-radius: var(--r-md);
    background: var(--panel);
    box-shadow: inset 0 0 0 0.2rem var(--tc);
    font: 900 1.5rem/1.2 var(--font);
    white-space: nowrap;
  }
  .result b {
    color: var(--tc);
  }
  .lm {
    top: 34%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.5rem 1.6rem 0.55rem;
    border-radius: var(--r-md);
    background: #d0103c;
    box-shadow: 0 0.4rem 0 rgb(0 0 0 / 0.25);
    font: italic 900 2.2rem/1.1 var(--font);
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .lm span {
    font: 800 0.85rem/1.2 var(--font);
    letter-spacing: 0.04em;
    opacity: 0.9;
  }
  @media (prefers-reduced-motion: no-preference) {
    .num {
      animation: pop 0.35s cubic-bezier(0.2, 1.5, 0.4, 1);
    }
    .call,
    .try,
    .result,
    .lm {
      animation: banner-pop 0.32s cubic-bezier(0.2, 1.5, 0.4, 1);
    }
  }
  @keyframes pop {
    from {
      transform: scale(1.8);
      opacity: 0;
    }
  }
  /* Comme pop, en gardant le centrage horizontal (translateX). */
  @keyframes banner-pop {
    from {
      transform: translateX(-50%) scale(1.6);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) scale(1);
      opacity: 1;
    }
  }
</style>
