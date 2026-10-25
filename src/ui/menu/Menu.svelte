<!--
  Menu de lancement (étape 8), par-dessus un match bots contre bots (session en mode `attract`) : format 3v3 / 5v5, rôle
  (cartes pilier / ailier / demi), difficulté des bots, entraînement, aperçu de l'équipe (les bots complètent la
  composition), aperçu des contrôles clavier ET manette, boutons Contrôles / Réglages, JOUER. Choix mémorisés
  (app.svelte.ts). Navigation : souris, clavier (Tab, flèches, Entrée), manette (croix / stick, A, B, Start = jouer).
-->
<script lang="ts">
  import { DIFFICULTIES, TEAM_SIZES } from '../../game/launch';
  import { characterPortraits } from '../../game/portraits';
  import { compositionText, roleCards, teamPreview } from '../../game/roleCards';
  import type { BotDifficulty, Role, TeamSize } from '../../game/session';
  import Glyph from '../common/Glyph.svelte';
  import Icon from '../common/Icon.svelte';
  import NavHints from '../common/NavHints.svelte';
  import Segmented from '../common/Segmented.svelte';
  import Toggle from '../common/Toggle.svelte';
  import { padButtonGlyph } from '../logic/controlHints';
  import { app } from '../state/app.svelte';
  import { navScope } from '../state/nav.svelte';
  import { DEFAULT_MENU_PAD_MAP } from '../../input/gamepadMap';
  import ControlsPreview from './ControlsPreview.svelte';
  import RoleCard from './RoleCard.svelte';

  const cards = roleCards();
  const ROLE_LABEL: Record<Role, string> = Object.fromEntries(cards.map((c) => [c.role, c.label])) as Record<Role, string>;
  const SIZE_OPTIONS = TEAM_SIZES.map((n) => ({ value: n, label: `${n} v ${n}`, hint: n === 3 ? 'terrain réduit' : 'grand terrain' }));
  const DIFF_LABEL: Record<BotDifficulty, string> = { facile: 'Facile', normal: 'Normal', difficile: 'Difficile' };
  const DIFF_OPTIONS = DIFFICULTIES.map((d) => ({ value: d, label: DIFF_LABEL[d] }));
  const team = $derived(teamPreview(app.setup.teamSize, app.setup.role));
  /** Code de salon saisi (rejoindre). */
  let roomCode = $state('');
  /** Portraits 3D des classes (rendus une fois en tâche de fond ; la carte garde son signe en attendant). */
  let portraits: Partial<Record<Role, string>> = $state({});
  $effect(() => {
    let alive = true;
    void characterPortraits().then((p) => {
      if (alive) portraits = p;
    });
    return () => {
      alive = false;
    };
  });
</script>

<!-- Inerte sous un panneau (contrôles, réglages) : Tab ne peut pas atteindre le menu caché derrière le voile. -->
<div class="menu" inert={app.panel !== null} {@attach navScope}>
  <div class="backdrop" aria-hidden="true"></div>
  <main class="main">
    <header class="brand">
      <h1 class="logo"><span class="o">OVAL</span><span class="g">GUN</span></h1>
      <p class="tagline">Rugby arcade · chaque arme plaque à distance</p>
    </header>

    <div class="row">
      <div class="field">
        <span class="label" id="lbl-size">Format</span>
        <Segmented label="Format" options={SIZE_OPTIONS} value={app.setup.teamSize} onselect={(v: TeamSize) => app.updateSetup({ teamSize: v })} />
      </div>
      <div class="field">
        <span class="label">Bots</span>
        <Segmented label="Difficulté des bots" options={DIFF_OPTIONS} value={app.setup.difficulty} onselect={(v: BotDifficulty) => app.updateSetup({ difficulty: v })} />
      </div>
    </div>

    <div class="field">
      <span class="label">Choisis ton rôle</span>
      <div class="cards" role="radiogroup" aria-label="Rôle">
        {#each cards as c (c.role)}
          <RoleCard card={c} portrait={portraits[c.role]} selected={c.role === app.setup.role} onselect={() => app.updateSetup({ role: c.role })} />
        {/each}
      </div>
    </div>

    <div class="team">
      <span class="label">Ton équipe</span>
      <span class="mates">
        {#each team as r, i (i)}
          <span class="mate" class:me={i === 0} title={i === 0 ? `Toi : ${ROLE_LABEL[r]}` : `Bot : ${ROLE_LABEL[r]}`}>
            <Icon name={r} size="1rem" />{i === 0 ? 'Toi' : ROLE_LABEL[r]}
          </span>
        {/each}
      </span>
      <span class="note">
        {#if app.setup.teamSize === 3}
          En 3v3, un de chaque rôle est conseillé : les bots complètent la composition.
        {:else}
          En 5v5, doublons autorisés : {compositionText(5)} par équipe.
        {/if}
      </span>
    </div>

    <div class="actions">
      <div class="train">
        <Toggle
          label="Mode entraînement"
          hint="chrono figé · outils : ballon pour moi / au centre"
          checked={app.setup.training}
          onchange={(v) => app.updateSetup({ training: v })}
        />
      </div>
      <button type="button" class="play" data-autofocus onclick={() => app.play()}>
        <Icon name="play" size="1.3rem" />
        <span>JOUER</span>
        <span class="pg">
          {#if app.device === 'gamepad'}<Glyph g={padButtonGlyph(DEFAULT_MENU_PAD_MAP.start, app.padStyle)} size="sm" />{:else}<Glyph g={{ kind: 'key', label: 'Entrée' }} size="sm" />{/if}
        </span>
      </button>
    </div>
  </main>

  <aside class="side">
    <div class="buttons">
      <button type="button" class="ghost" onclick={() => app.openPanel('controls')}><Icon name="controls" size="1.15rem" /> Contrôles</button>
      <button type="button" class="ghost" onclick={() => app.openPanel('settings')}><Icon name="settings" size="1.15rem" /> Réglages</button>
    </div>
    <section class="online" aria-label="En ligne">
      <span class="label">En ligne · avec tes potes</span>
      <input
        class="text"
        type="text"
        placeholder="Ton pseudo"
        maxlength="16"
        autocomplete="nickname"
        value={app.playerName}
        oninput={(e) => app.setName(e.currentTarget.value)}
      />
      <button type="button" class="ghost wide" disabled={app.server === ''} onclick={() => app.createRoom()}><Icon name="play" size="1.05rem" /> Créer un salon</button>
      <form
        class="join"
        onsubmit={(e) => {
          e.preventDefault();
          app.joinRoom(roomCode);
        }}
      >
        <input class="text code" type="text" placeholder="CODE" maxlength="5" autocomplete="off" spellcheck="false" bind:value={roomCode} />
        <button type="submit" class="ghost" disabled={app.server === ''}>Rejoindre</button>
      </form>
      {#if app.onlineError !== ''}<p class="warn">{app.onlineError}</p>{/if}
      {#if app.server === ''}<p class="info">Mode en ligne pas encore configuré sur ce site.</p>{/if}
    </section>
    <ControlsPreview />
    {#if app.padIgnored && !app.padConnected}
      <p class="warn">Manette détectée mais non reconnue (disposition non « standard ») : essaie Chrome ou Edge.</p>
    {:else if app.padConnected && app.device === 'keyboard'}
      <p class="info"><Icon name="gamepad" /> Manette branchée : appuie sur un bouton pour l’utiliser.</p>
    {/if}
  </aside>

  <footer class="foot">
    <NavHints hints={[{ pad: 'confirm', key: 'Entrée', label: 'Valider' }, { pad: 'start', label: 'Jouer' }]} />
  </footer>
</div>

<style>
  .menu {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-columns: minmax(0, 46rem) minmax(16rem, 22rem);
    grid-template-rows: 1fr auto;
    justify-content: space-between;
    gap: 1rem 2rem;
    padding: 1.6rem 2rem 1rem;
    box-sizing: border-box;
    overflow-y: auto;
    color: #fff;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
      linear-gradient(100deg, rgb(15 13 43 / 0.94) 0%, rgb(15 13 43 / 0.82) 45%, rgb(15 13 43 / 0.35) 75%, rgb(15 13 43 / 0.55) 100%),
      repeating-linear-gradient(-55deg, rgb(255 255 255 / 0.025) 0 1.2rem, transparent 1.2rem 2.4rem);
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 0.95rem;
    min-width: 0;
  }
  .brand {
    margin-bottom: 0.2rem;
  }
  .logo {
    margin: 0;
    font: italic 900 3.6rem/0.95 var(--font);
    letter-spacing: 0.01em;
    transform: skewX(-6deg);
    transform-origin: left;
  }
  .logo .o {
    color: var(--t0);
    text-shadow: 0.2rem 0.2rem 0 var(--ink);
  }
  .logo .g {
    color: var(--t1);
    text-shadow: 0.2rem 0.2rem 0 var(--ink);
  }
  .tagline {
    margin: 0.35rem 0 0;
    font: 800 0.9rem/1.2 var(--font);
    color: var(--text-dim);
    letter-spacing: 0.03em;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem 1.6rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .label {
    font: italic 900 0.75rem/1 var(--font);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    padding-top: 0.25rem;
  }
  .team {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.7rem;
  }
  .mates {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .mate {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    font: 800 0.75rem/1.2 var(--font);
    color: var(--text-dim);
    --icon-cut: transparent;
  }
  .mate.me {
    background: var(--t0);
    color: #fff;
  }
  .note {
    font: 600 0.75rem/1.3 var(--font);
    color: var(--text-faint);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 0.8rem 1.2rem;
    margin-top: 0.2rem;
  }
  .train {
    flex: 1 1 16rem;
    max-width: 24rem;
  }
  .play {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 1.6rem 0.6rem 1.3rem;
    border: 0;
    border-radius: var(--r-lg);
    background: linear-gradient(180deg, #ffe95a, var(--accent));
    color: var(--ink);
    --icon-cut: var(--accent);
    font: italic 900 1.8rem/1 var(--font);
    letter-spacing: 0.04em;
    box-shadow: 0 0.35rem 0 #b89a00;
    cursor: pointer;
    transform: skewX(-6deg);
    transition:
      transform 0.1s,
      box-shadow 0.1s;
  }
  .play:hover {
    transform: skewX(-6deg) translateY(-0.12rem);
  }
  .play:active {
    transform: skewX(-6deg) translateY(0.2rem);
    box-shadow: 0 0.15rem 0 #b89a00;
  }
  .pg {
    font-size: 1rem;
    font-style: normal;
  }
  .side {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.8rem;
    min-width: 0;
  }
  .buttons {
    display: flex;
    gap: 0.6rem;
  }
  .ghost {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.6rem 0.8rem;
    border: 0;
    border-radius: var(--r-md);
    background: var(--panel);
    box-shadow: inset 0 0 0 0.1rem var(--stroke);
    color: #fff;
    font: 800 0.9rem/1 var(--font);
    cursor: pointer;
  }
  .ghost:hover {
    background: var(--panel-hi);
  }
  .online {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.7rem;
    border-radius: var(--r-md);
    background: var(--panel);
    box-shadow: inset 0 0 0 0.1rem var(--stroke);
  }
  .text {
    min-width: 0;
    padding: 0.5rem 0.7rem;
    border: 0;
    border-radius: var(--r-sm);
    background: rgb(10 8 32 / 0.7);
    box-shadow: inset 0 0 0 0.1rem var(--stroke);
    color: #fff;
    font: 800 0.9rem/1.1 var(--font);
  }
  .text.code {
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    font-weight: 900;
  }
  .join {
    display: flex;
    gap: 0.45rem;
  }
  .ghost.wide {
    flex: none;
  }
  .ghost:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .warn,
  .info {
    margin: 0;
    padding: 0.45rem 0.7rem;
    border-radius: var(--r-sm);
    background: var(--panel);
    font: 700 0.75rem/1.3 var(--font);
  }
  .warn {
    color: #ffd27a;
  }
  .info {
    color: var(--cyan);
  }
  .foot {
    grid-column: 1 / -1;
  }
  @media (prefers-reduced-motion: no-preference) {
    .main {
      animation: rise 0.35s ease-out;
    }
  }
  @keyframes rise {
    from {
      transform: translateY(0.8rem);
      opacity: 0;
    }
  }
  /* Petites fenêtres : une seule colonne (l'aperçu des contrôles passe dessous, le menu défile si besoin). */
  @media (max-width: 1000px), (max-height: 560px) {
    .menu {
      grid-template-columns: minmax(0, 1fr);
      padding: 1rem 1.2rem 0.8rem;
    }
    .side {
      justify-content: flex-start;
    }
    .logo {
      font-size: 2.6rem;
    }
  }
</style>
