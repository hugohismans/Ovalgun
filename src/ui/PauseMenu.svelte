<!--
  Menu de pause (étape 8) — Échap / perte du pointer lock au clavier, Start à la manette : reprendre, contrôles, réglages,
  recommencer, quitter vers le menu. Rappel du score et du chrono. B / Start : reprendre ; Échap aussi en ?debug ou à la
  manette (au clavier hors ?debug, Échap met le focus sur « Reprendre » : le navigateur refuse le pointer lock sur Échap).
  Recommencer et Quitter demandent un second appui (confirmation, CONFIRM_MS). Au retour d'un panneau (contrôles,
  réglages), le focus revient sur son bouton.
-->
<script lang="ts">
  import Icon from './common/Icon.svelte';
  import Panel from './common/Panel.svelte';
  import { app } from './state/app.svelte';
  import { hud } from './state/hud.svelte';

  /** Durée (ms) pendant laquelle « Recommencer » / « Quitter » attendent un second appui de confirmation. */
  const CONFIRM_MS = 2500;

  const m = $derived(hud.snap?.match ?? null);
  /**
   * Échap ne peut pas reprendre au clavier hors ?debug (le navigateur refuse le pointer lock sur Échap) : l'aide clavier
   * n'annonce pas « Échap : Reprendre » (Échap met le focus sur « Reprendre », app.back).
   */
  const escapeResumes = $derived(hud.snap?.debug === true || app.device !== 'keyboard');
  /** Action qui attend sa confirmation (premier appui fait), null : aucune. Annulée par le délai ou en quittant le bouton. */
  let armed = $state<'restart' | 'quit' | null>(null);
  let timer = 0;
  function confirmThen(which: 'restart' | 'quit', action: () => void): void {
    window.clearTimeout(timer);
    if (armed === which) {
      armed = null;
      action();
      return;
    }
    armed = which;
    timer = window.setTimeout(() => (armed = null), CONFIRM_MS);
  }
  const disarm = (which: 'restart' | 'quit') => (): void => {
    if (armed === which) armed = null;
  };
  $effect(() => () => window.clearTimeout(timer));
  const st = $derived(app.setup);
  const DIFF: Record<string, string> = { facile: 'bots faciles', normal: 'bots normaux', difficile: 'bots difficiles' };
</script>

<Panel title="Pause" subtitle={`${st.teamSize}v${st.teamSize} · ${DIFF[st.difficulty] ?? ''}${st.training ? ' · entraînement' : ''}`} onback={() => app.resume()} backLabel="Reprendre" backKey={escapeResumes ? 'Échap' : null}>
  {#if m}
    <div class="score">
      <span class="t0">{m.teamNames[0]}</span>
      <b class="t0">{m.score[0]}</b>
      <span class="clock">{m.training ? '∞' : m.clock}</span>
      <b class="t1">{m.score[1]}</b>
      <span class="t1">{m.teamNames[1]}</span>
    </div>
  {/if}
  <div class="list">
    <button type="button" id="pause-resume" class="item primary" data-autofocus={app.lastPanel === null ? '' : undefined} onclick={() => app.resume()}><Icon name="play" size="1.2rem" /> Reprendre</button>
    <button type="button" class="item" data-autofocus={app.lastPanel === 'controls' ? '' : undefined} onclick={() => app.openPanel('controls')}><Icon name="controls" size="1.2rem" /> Contrôles</button>
    <button type="button" class="item" data-autofocus={app.lastPanel === 'settings' ? '' : undefined} onclick={() => app.openPanel('settings')}><Icon name="settings" size="1.2rem" /> Réglages</button>
    <button type="button" class="item" class:armed={armed === 'restart'} onclick={() => confirmThen('restart', () => app.restart())} onblur={disarm('restart')}>
      <Icon name="restart" size="1.2rem" />
      {armed === 'restart' ? 'Confirmer : recommencer ?' : 'Recommencer'}
    </button>
    <button type="button" class="item danger" class:armed={armed === 'quit'} onclick={() => confirmThen('quit', () => app.quitToMenu())} onblur={disarm('quit')}>
      <Icon name="exit" size="1.2rem" />
      {armed === 'quit' ? 'Confirmer : quitter le match ?' : 'Quitter vers le menu'}
    </button>
  </div>
</Panel>

<style>
  .score {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    margin-bottom: 0.9rem;
    padding: 0.5rem;
    border-radius: var(--r-md);
    background: rgb(10 8 32 / 0.55);
    font: italic 900 0.85rem/1 var(--font);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .score b {
    font-size: 1.8rem;
  }
  .t0 {
    color: var(--t0);
  }
  .t1 {
    color: var(--t1);
  }
  .clock {
    padding: 0.3rem 0.6rem;
    border-radius: var(--r-sm);
    background: var(--ink);
    font: 900 1.1rem/1 var(--font);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.75rem 1rem;
    border: 0;
    border-radius: var(--r-md);
    background: rgb(255 255 255 / 0.08);
    color: #fff;
    font: 800 1.05rem/1 var(--font);
    text-align: left;
    cursor: pointer;
    transition:
      background 0.12s,
      transform 0.12s;
  }
  .item:hover,
  .item:focus {
    background: rgb(255 255 255 / 0.16);
  }
  .item :global(svg) {
    transition: transform 0.12s;
  }
  .item:hover :global(svg),
  .item:focus :global(svg) {
    transform: translateX(0.2rem);
  }
  .item.primary {
    background: var(--accent);
    color: var(--ink);
    --icon-cut: var(--accent);
    font-style: italic;
    font-weight: 900;
  }
  .item.danger {
    color: #ff8aa0;
  }
  /* Premier appui sur Recommencer / Quitter : le bouton attend une confirmation (second appui). */
  .item.armed,
  .item.armed:hover,
  .item.armed:focus {
    background: var(--bad);
    color: #fff;
    --icon-cut: var(--bad);
  }
</style>
