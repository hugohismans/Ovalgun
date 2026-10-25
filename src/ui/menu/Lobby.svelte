<!--
  Salon en ligne : code et lien d'invitation, joueurs par équipe, choix de son équipe et de son rôle, et pour l'hôte le
  format (3v3 / 5v5), la difficulté des bots qui complètent les équipes, et « Lancer la partie ». Navigable à la souris,
  au clavier et à la manette (boutons focalisables).
-->
<script lang="ts">
  import { TEAM_COLORS, TEAM_NAMES } from '../../game/matchHud';
  import { roleCards } from '../../game/roleCards';
  import type { BotDifficulty, Role, TeamId, TeamSize } from '../../game/session';
  import Icon from '../common/Icon.svelte';
  import NavHints from '../common/NavHints.svelte';
  import Segmented from '../common/Segmented.svelte';
  import { app } from '../state/app.svelte';
  import { navScope } from '../state/nav.svelte';

  const cards = roleCards();
  const ROLE_LABEL = Object.fromEntries(cards.map((c) => [c.role, c.label])) as Record<Role, string>;
  const SIZE_OPTIONS = [3, 5].map((n) => ({ value: n as TeamSize, label: `${n} v ${n}` }));
  const DIFF_OPTIONS: Array<{ value: BotDifficulty; label: string }> = [
    { value: 'facile', label: 'Facile' },
    { value: 'normal', label: 'Normal' },
    { value: 'difficile', label: 'Difficile' },
  ];

  const o = $derived(app.online);
  const lobby = $derived(o?.lobby ?? null);
  const me = $derived(lobby?.players.find((p) => p.id === o?.you) ?? null);
  const teamSize = $derived(lobby?.config.teamSize ?? 3);
  let copied = $state(false);

  const members = (team: TeamId) => lobby?.players.filter((p) => p.team === team) ?? [];

  async function copyInvite(): Promise<void> {
    if (o === null) return;
    try {
      await navigator.clipboard.writeText(o.invite);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      copied = false;
    }
  }
</script>

<div class="lobby" {@attach navScope}>
  <div class="backdrop" aria-hidden="true"></div>
  <main class="main">
    <header class="head">
      <div>
        <span class="label">Salon en ligne</span>
        <h1 class="code">{o?.code ?? ''}</h1>
      </div>
      <div class="share">
        <button type="button" class="ghost" data-autofocus onclick={copyInvite}><Icon name="controls" size="1.05rem" /> {copied ? 'Lien copié !' : 'Copier le lien d’invitation'}</button>
        <small>Envoie le lien (ou le code) à tes potes : ils arrivent directement ici.</small>
      </div>
    </header>

    {#if o === null || o.status === 'connecting' || lobby === null}
      <p class="status">Connexion au serveur…</p>
    {:else}
      {#if lobby.phase === 'match'}
        <p class="status">Une partie est en cours dans ce salon : tu joueras la suivante.</p>
      {/if}
      <div class="teams">
        {#each [0, 1] as const as team (team)}
          <section class="team" style:--tc={TEAM_COLORS[team]}>
            <h2>{TEAM_NAMES[team]} <small>{members(team).length} / {teamSize}</small></h2>
            <ul>
              {#each members(team) as p (p.id)}
                <li class:me={p.id === o.you}>
                  <Icon name={p.role} size="1.1rem" />
                  <b>{p.name}</b>
                  <span class="role">{ROLE_LABEL[p.role]}</span>
                  {#if p.host}<span class="tag">hôte</span>{/if}
                </li>
              {/each}
              {#each { length: Math.max(0, teamSize - members(team).length) } as _, i (i)}
                <li class="bot"><Icon name="bot" size="1.1rem" /> Bot</li>
              {/each}
            </ul>
            {#if me !== null && me.team !== team && lobby.phase === 'lobby'}
              <button type="button" class="ghost" disabled={members(team).length >= teamSize} onclick={() => app.setOnlineTeam(team)}>Rejoindre {TEAM_NAMES[team]}</button>
            {/if}
          </section>
        {/each}
      </div>

      <div class="field">
        <span class="label">Ton rôle</span>
        <div class="roles" role="radiogroup" aria-label="Ton rôle">
          {#each cards as c (c.role)}
            <button type="button" class="role-btn" class:on={me?.role === c.role} role="radio" aria-checked={me?.role === c.role} onclick={() => app.setOnlineRole(c.role)}>
              <Icon name={c.role} size="1.3rem" />
              <b>{c.label}</b>
              <small>{c.weapon}</small>
            </button>
          {/each}
        </div>
      </div>

      {#if app.isHost}
        <div class="row">
          <div class="field">
            <span class="label">Format</span>
            <Segmented label="Format" options={SIZE_OPTIONS} value={teamSize} onselect={(v: TeamSize) => app.setOnlineConfig({ teamSize: v })} />
          </div>
          <div class="field">
            <span class="label">Bots</span>
            <Segmented label="Difficulté des bots" options={DIFF_OPTIONS} value={lobby.config.difficulty} onselect={(v: BotDifficulty) => app.setOnlineConfig({ difficulty: v })} />
          </div>
        </div>
      {/if}
    {/if}

    {#if o?.error}<p class="warn">{o.error}</p>{/if}

    <div class="actions">
      {#if app.isHost}
        <button type="button" class="play" disabled={lobby === null || lobby.phase !== 'lobby'} onclick={() => app.startOnline()}><Icon name="play" size="1.3rem" /> LANCER LA PARTIE</button>
      {:else if lobby !== null}
        <p class="status">En attente de l’hôte pour lancer la partie…</p>
      {/if}
      <button type="button" class="ghost" onclick={() => app.leaveRoom()}><Icon name="exit" size="1.05rem" /> Quitter le salon</button>
    </div>
  </main>
  <footer class="foot">
    <NavHints hints={[{ pad: 'confirm', key: 'Entrée', label: 'Valider' }]} />
  </footer>
</div>

<style>
  .lobby {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 1.6rem 2rem 1rem;
    box-sizing: border-box;
    overflow-y: auto;
    color: #fff;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    background: linear-gradient(100deg, rgb(15 13 43 / 0.95) 0%, rgb(15 13 43 / 0.85) 55%, rgb(15 13 43 / 0.5) 100%);
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 52rem;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }
  .label {
    font: italic 900 0.75rem/1 var(--font);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .code {
    margin: 0.2rem 0 0;
    font: italic 900 3.4rem/1 var(--font);
    letter-spacing: 0.18em;
    text-shadow: 0.2rem 0.2rem 0 var(--ink);
  }
  .share {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    max-width: 20rem;
  }
  .share small,
  .status {
    margin: 0;
    font: 700 0.8rem/1.3 var(--font);
    color: var(--text-dim);
  }
  .teams {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }
  .team {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.8rem;
    border-radius: var(--r-lg);
    background: var(--panel);
    box-shadow:
      inset 0 0 0 0.12rem var(--stroke),
      inset 0 0.3rem 0 var(--tc);
  }
  .team h2 {
    margin: 0;
    font: italic 900 1.2rem/1 var(--font);
    color: var(--tc);
  }
  .team h2 small {
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem 0.55rem;
    border-radius: var(--r-sm);
    background: rgb(255 255 255 / 0.06);
    font: 700 0.85rem/1.2 var(--font);
    --icon-cut: transparent;
  }
  li.me {
    box-shadow: inset 0 0 0 0.12rem var(--tc);
  }
  li.bot {
    color: var(--text-faint);
  }
  .role {
    color: var(--text-dim);
    font-size: 0.75rem;
  }
  .tag {
    margin-left: auto;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--ink);
    font: 900 0.65rem/1.3 var(--font);
    text-transform: uppercase;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem 1.6rem;
  }
  .roles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .role-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    padding: 0.6rem 0.7rem;
    border: 0;
    border-radius: var(--r-md);
    background: var(--panel);
    box-shadow: inset 0 0 0 0.1rem var(--stroke);
    color: #fff;
    font: 900 1rem/1.1 var(--font);
    text-align: left;
    cursor: pointer;
    --icon-cut: var(--panel);
  }
  .role-btn small {
    font: 700 0.72rem/1.2 var(--font);
    color: var(--text-dim);
  }
  .role-btn.on {
    box-shadow: inset 0 0 0 0.16rem var(--accent);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.8rem 1.2rem;
  }
  .play {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 1.5rem;
    border: 0;
    border-radius: var(--r-lg);
    background: linear-gradient(180deg, #ffe95a, var(--accent));
    color: var(--ink);
    --icon-cut: var(--accent);
    font: italic 900 1.4rem/1 var(--font);
    box-shadow: 0 0.35rem 0 #b89a00;
    cursor: pointer;
    transform: skewX(-6deg);
  }
  .play:disabled,
  .ghost:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.55rem 0.8rem;
    border: 0;
    border-radius: var(--r-md);
    background: var(--panel);
    box-shadow: inset 0 0 0 0.1rem var(--stroke);
    color: #fff;
    font: 800 0.85rem/1 var(--font);
    cursor: pointer;
  }
  .ghost:hover:not(:disabled) {
    background: var(--panel-hi);
  }
  .warn {
    margin: 0;
    padding: 0.45rem 0.7rem;
    border-radius: var(--r-sm);
    background: var(--panel);
    color: #ffd27a;
    font: 700 0.8rem/1.3 var(--font);
  }
  @media (max-width: 760px) {
    .teams,
    .roles {
      grid-template-columns: 1fr;
    }
  }
</style>
