<!--
  Flux d'événements discret (étape 8), en haut à droite : plaquages, interceptions, essais, mêlées, avec les noms et les
  signes de rôle des joueurs aux couleurs de leur équipe ; liseré vert / rouge selon que c'est bon ou mauvais pour ton
  équipe. Lignes produites par src/game/eventFeed.ts (durée, fondu, nombre max : STYLE).
-->
<script lang="ts">
  import type { FeedItem } from '../../game/eventFeed';
  import type { PlayerTag } from '../../game/names';
  import Icon, { type IconName } from '../common/Icon.svelte';
  import { hud } from '../state/hud.svelte';

  const items = $derived(hud.snap?.feed ?? []);
  const ICON: Record<FeedItem['kind'], IconName> = { tackle: 'tackle', interception: 'intercept', try: 'try', scrum: 'scrum' };
  const tc = (p: PlayerTag): string => (p.team === 0 ? 'var(--t0)' : 'var(--t1)');
</script>

{#snippet who(p: PlayerTag)}
  <span class="who" class:me={p.local} style:--tc={tc(p)}><Icon name={p.role} size="0.85em" />{p.name}</span>
{/snippet}

<ul class="feed" aria-label="Derniers événements">
  {#each items as it (it.key)}
    <li class="item {it.tone} {it.kind}" style:opacity={it.alpha}>
      <span class="kind"><Icon name={ICON[it.kind]} size="0.95rem" /></span>
      {#if it.actor}{@render who(it.actor)}{/if}
      <span class="verb">{it.text}</span>
      {#if it.target}{@render who(it.target)}{/if}
      {#if it.extra}<span class="extra">{it.extra}</span>{/if}
    </li>
  {/each}
</ul>

<style>
  .feed {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
    pointer-events: none;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 30rem;
    padding: 0.3rem 0.65rem 0.3rem 0.4rem;
    border-radius: var(--r-sm);
    background: var(--panel);
    box-shadow: inset 0.22rem 0 0 rgb(255 255 255 / 0.3);
    color: var(--text-dim);
    font: 700 0.8rem/1.2 var(--font);
    white-space: nowrap;
  }
  .item.good {
    box-shadow: inset 0.22rem 0 0 var(--good);
  }
  .item.bad {
    box-shadow: inset 0.22rem 0 0 var(--bad);
  }
  .item.try {
    background: rgb(40 32 6 / 0.88);
    color: #fff;
  }
  .kind {
    display: grid;
    place-items: center;
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.1);
    color: #fff;
    --icon-cut: transparent;
  }
  .try .kind {
    background: var(--accent);
    color: var(--ink);
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    color: var(--tc);
    font-weight: 900;
    filter: brightness(1.2);
    --icon-cut: rgb(18 15 52);
  }
  .who.me {
    padding: 0 0.35rem;
    border-radius: 0.3rem;
    background: var(--tc);
    color: #fff;
    filter: none;
    --icon-cut: var(--tc);
  }
  .verb {
    color: #fff;
  }
  .extra {
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: rgb(255 225 46 / 0.18);
    color: var(--accent);
    font-size: 0.7rem;
  }
  @media (prefers-reduced-motion: no-preference) {
    .item {
      animation: slide-in 0.25s ease-out;
    }
  }
  @keyframes slide-in {
    from {
      transform: translateX(1.5rem);
      opacity: 0;
    }
  }
</style>
