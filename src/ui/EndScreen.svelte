<!--
  Écran de fin (étape 6, au style de l'étape 8) : VICTOIRE / DÉFAITE / ÉGALITÉ, score final, joueur du match, statistiques
  par joueur (essais, plaquages, passes réussies, interceptions, précision), ton équipe d'abord. Rejouer / Menu, actifs
  après STYLE.endScreenInputDelaySec (un saut en cours ne relance pas le match) ; A, Entrée, clic ; Start = Rejouer.
-->
<script lang="ts">
  import type { PlayerLine } from '../game/matchHud';
  import Icon from './common/Icon.svelte';
  import NavHints from './common/NavHints.svelte';
  import { app } from './state/app.svelte';
  import { hud } from './state/hud.svelte';
  import { navScope } from './state/nav.svelte';

  let replayBtn = $state<HTMLButtonElement | null>(null);
  const m = $derived(hud.snap?.match ?? null);
  const f = $derived(m?.final ?? null);
  const OUTCOME: Record<string, string> = { win: 'VICTOIRE', loss: 'DÉFAITE', draw: 'ÉGALITÉ' };
  const acc = (a: number | null): string => (a === null ? '—' : `${Math.round(a * 100)} %`);
  /** Joueur du match : calculé par matchHud.ts (matchMvp, poids STYLE.mvpWeights). */
  const mvp = $derived<PlayerLine | null>(f === null ? null : (f.players.find((p) => p.id === f.mvpId) ?? null));
  const canReplay = $derived(f?.canReplay ?? false);
  // Les boutons s'activent après un court délai : « Rejouer » prend alors le focus (A / Entrée le valident).
  $effect(() => {
    if (canReplay && replayBtn !== null && !(document.activeElement instanceof HTMLButtonElement)) replayBtn.focus({ preventScroll: true });
  });
</script>

{#if m && f}
  <div class="end {f.outcome}" {@attach navScope}>
    <div class="banner">
      <h1>{OUTCOME[f.outcome]}</h1>
      <div class="score">
        <span class="t0">{m.teamNames[0]}</span>
        <b class="t0">{f.score[0]}</b>
        <i>–</i>
        <b class="t1">{f.score[1]}</b>
        <span class="t1">{m.teamNames[1]}</span>
      </div>
      {#if mvp}
        <p class="mvp" style:--tc={mvp.team === 0 ? 'var(--t0)' : 'var(--t1)'}>
          <Icon name="try" /> Joueur du match : <b><Icon name={mvp.role} size="0.9em" /> {mvp.local ? 'Toi' : `${mvp.name} · ${m.teamNames[mvp.team]}`}</b>
        </p>
      {/if}
    </div>
    <div class="card">
      <table>
        <thead>
          <tr><th>Joueur</th><th>Essais</th><th>Plaquages</th><th>Passes</th><th>Interc.</th><th>Précision</th></tr>
        </thead>
        <tbody>
          {#each f.players as p (p.id)}
            <tr class:me={p.local} style:--tc={p.team === 0 ? 'var(--t0)' : 'var(--t1)'}>
              <td class="who"><span class="sign"><Icon name={p.role} size="0.95em" /></span>{p.name}{p.local ? ' (toi)' : ''}</td>
              <td>{p.tries}</td>
              <td>{p.tackles}</td>
              <td>{p.passes}</td>
              <td>{p.interceptions}</td>
              <td>{acc(p.accuracy)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if app.online !== null}
        <p class="online-note">Retour au salon dans quelques secondes…</p>
        <div class="buttons">
          <button type="button" class="menu" data-autofocus onclick={() => app.quitToMenu()}><Icon name="exit" size="1.2rem" /> Quitter le salon</button>
        </div>
      {:else}
        <div class="buttons">
          <button type="button" class="replay" data-autofocus bind:this={replayBtn} disabled={!f.canReplay} onclick={() => app.restart()}><Icon name="restart" size="1.2rem" /> Rejouer</button>
          <button type="button" class="menu" disabled={!f.canReplay} onclick={() => app.quitToMenu()}><Icon name="exit" size="1.2rem" /> Menu</button>
        </div>
      {/if}
      <NavHints hints={[{ pad: 'confirm', key: 'Entrée', label: 'Valider' }, { pad: 'start', label: 'Rejouer' }]} />
    </div>
  </div>
{/if}

<style>
  .online-note {
    margin: 0.4rem 0;
    font: 700 0.9rem/1.3 var(--font);
    color: var(--text-dim);
    text-align: center;
  }
  .end {
    --oc: #19b86b;
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem;
    box-sizing: border-box;
    overflow-y: auto;
    background: radial-gradient(ellipse at center, rgb(16 22 74 / 0.6), rgb(10 13 42 / 0.92));
    color: #fff;
  }
  .end.loss {
    --oc: #e0294a;
  }
  .end.draw {
    --oc: #8a86c0;
  }
  .banner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
  }
  h1 {
    margin: 0;
    padding: 0.2rem 2.2rem;
    background: var(--oc);
    font: italic 900 3.6rem/1.05 var(--font);
    letter-spacing: 0.04em;
    transform: skewX(-8deg);
    box-shadow: 0 0.45rem 0 rgb(0 0 0 / 0.3);
  }
  .score {
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
    font: italic 900 1rem/1 var(--font);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .score b {
    font-size: 3rem;
  }
  .score i {
    opacity: 0.5;
    font-size: 2rem;
  }
  .t0 {
    color: var(--t0);
  }
  .t1 {
    color: var(--t1);
  }
  .mvp {
    margin: 0;
    padding: 0.3rem 0.8rem;
    border-radius: 999px;
    background: var(--panel);
    font: 700 0.85rem/1.2 var(--font);
    color: var(--text-dim);
  }
  .mvp b {
    color: var(--tc);
    filter: brightness(1.2);
    --icon-cut: transparent;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    width: min(42rem, 100%);
    padding: 1rem 1.2rem;
    box-sizing: border-box;
    border-radius: var(--r-lg);
    background: linear-gradient(165deg, #2a2563, #16133f 70%);
    box-shadow:
      inset 0 0 0 0.12rem var(--stroke),
      0 0.6rem 0 rgb(0 0 0 / 0.3);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font: 700 0.85rem/1.4 var(--font);
  }
  th {
    padding: 0.2rem 0.5rem;
    font: 800 0.66rem/1.3 var(--font);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-faint);
    text-align: right;
  }
  td {
    padding: 0.28rem 0.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    border-top: 0.06rem solid rgb(255 255 255 / 0.06);
  }
  th:first-child,
  td.who {
    text-align: left;
  }
  td.who {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .sign {
    display: grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--tc);
    --icon-cut: var(--tc);
  }
  tr.me td {
    background: rgb(255 225 46 / 0.14);
    font-weight: 900;
  }
  .buttons {
    display: flex;
    justify-content: center;
    gap: 0.8rem;
  }
  .buttons button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 1.6rem;
    border: 0;
    border-radius: var(--r-md);
    font: italic 900 1.2rem/1 var(--font);
    cursor: pointer;
  }
  .replay {
    background: var(--accent);
    color: var(--ink);
    --icon-cut: var(--accent);
    box-shadow: 0 0.3rem 0 #b89a00;
  }
  .menu {
    background: rgb(255 255 255 / 0.12);
    color: #fff;
  }
  .buttons button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  @media (prefers-reduced-motion: no-preference) {
    h1 {
      animation: slam 0.45s cubic-bezier(0.2, 1.5, 0.4, 1);
    }
  }
  @keyframes slam {
    from {
      transform: skewX(-8deg) scale(1.8);
      opacity: 0;
    }
  }
</style>
