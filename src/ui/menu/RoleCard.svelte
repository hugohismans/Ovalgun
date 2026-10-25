<!--
  Carte de rôle du menu de lancement (étape 8) : signe géométrique, nom, arme, description, statistiques visuelles
  (vitesse, portée, dégâts : pastilles relatives aux trois rôles + valeur réelle) et capacité, tirées de ROLES
  (src/game/roleCards.ts). Bouton radio : clic, Entrée, A à la manette.
-->
<script lang="ts">
  import { STAT_PIPS, type RoleCard } from '../../game/roleCards';
  import Icon from '../common/Icon.svelte';

  let { card, selected, onselect }: { card: RoleCard; selected: boolean; onselect: () => void } = $props();
</script>

<button type="button" class="card {card.role}" class:on={selected} role="radio" aria-checked={selected} onclick={onselect}>
  <span class="head">
    <span class="sign"><Icon name={card.role} size="1.6rem" /></span>
    <span class="title">
      <b>{card.label}</b>
      <small>{card.weapon}</small>
    </span>
    {#if selected}<span class="pick">CHOISI</span>{/if}
  </span>
  <span class="desc">{card.description}</span>
  <span class="stats">
    {#each card.stats as st (st.id)}
      <span class="stat">
        <span class="sl">{st.label}</span>
        <span class="pips" aria-label="{st.rating} sur {STAT_PIPS}">
          {#each { length: STAT_PIPS } as _, i (i)}<i class:full={i < st.rating}></i>{/each}
        </span>
        <span class="sv">{st.text}</span>
      </span>
    {/each}
  </span>
  <span class="ability">
    <span class="al">Capacité</span>
    <b>{card.ability.label}</b>
    <small>{card.ability.detail}</small>
  </span>
</button>

<style>
  .card {
    --rc: #ffffff;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    min-width: 0;
    padding: 0.8rem 0.85rem 0.85rem;
    border: 0;
    border-radius: var(--r-lg);
    background: linear-gradient(160deg, rgb(42 37 99 / 0.95), rgb(20 17 56 / 0.95));
    box-shadow:
      inset 0 0 0 0.12rem var(--stroke),
      0 0.35rem 0 rgb(0 0 0 / 0.3);
    color: #fff;
    text-align: left;
    cursor: pointer;
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }
  .card.pilier {
    --rc: #ff9d3c;
  }
  .card.ailier {
    --rc: #3dffa0;
  }
  .card.demi {
    --rc: #b48cff;
  }
  .card:hover {
    transform: translateY(-0.15rem);
  }
  .card.on {
    background: linear-gradient(160deg, color-mix(in srgb, var(--rc) 30%, #2a2563), rgb(20 17 56 / 0.97) 70%);
    box-shadow:
      inset 0 0 0 0.2rem var(--rc),
      0 0.45rem 0 rgb(0 0 0 / 0.35);
    transform: translateY(-0.25rem);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }
  .sign {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.8rem;
    background: var(--rc);
    color: var(--ink);
    --icon-cut: var(--rc);
    transform: rotate(-6deg);
  }
  .title {
    display: flex;
    flex-direction: column;
  }
  .title b {
    font: italic 900 1.3rem/1 var(--font);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .title small {
    margin-top: 0.15rem;
    font: 700 0.72rem/1.2 var(--font);
    color: var(--rc);
  }
  .pick {
    margin-left: auto;
    align-self: flex-start;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    background: var(--rc);
    color: var(--ink);
    font: 900 0.6rem/1.2 var(--font);
    letter-spacing: 0.1em;
  }
  .desc {
    min-height: 2.6em;
    font: 600 0.78rem/1.3 var(--font);
    color: var(--text-dim);
  }
  .stats {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .stat {
    display: grid;
    grid-template-columns: 4.2rem 1fr auto;
    align-items: center;
    gap: 0.45rem;
  }
  .sl {
    font: 800 0.72rem/1 var(--font);
    color: var(--text-dim);
  }
  .pips {
    display: flex;
    gap: 0.18rem;
  }
  .pips i {
    flex: 1;
    height: 0.5rem;
    border-radius: 0.15rem;
    background: rgb(255 255 255 / 0.13);
    transform: skewX(-18deg);
  }
  .pips i.full {
    background: var(--rc);
  }
  .sv {
    font: 800 0.68rem/1 var(--font);
    color: #fff;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .ability {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15rem 0.4rem;
    padding: 0.45rem 0.6rem;
    border-radius: var(--r-sm);
    background: rgb(10 8 32 / 0.55);
  }
  .al {
    width: 100%;
    font: 900 0.58rem/1 var(--font);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .ability b {
    font: 900 0.85rem/1.2 var(--font);
    color: var(--rc);
  }
  .ability small {
    font: 700 0.68rem/1.2 var(--font);
    color: var(--text-dim);
  }
</style>
