<!--
  Panneau modal des menus (étape 8) : voile sombre, carte titrée, bouton retour, aide de navigation. Portée de navigation
  (navScope) : focus initial, focus rendu à la fermeture. B / Échap : `onback` (aide clavier `backKey`).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { navScope } from '../state/nav.svelte';
  import Icon from './Icon.svelte';
  import NavHints from './NavHints.svelte';

  let {
    title,
    subtitle = '',
    onback,
    backLabel = 'Retour',
    backKey = 'Échap',
    wide = false,
    children,
  }: {
    title: string;
    subtitle?: string;
    onback: () => void;
    backLabel?: string;
    /** Touche du retour dans l'aide clavier (null : pas d'aide clavier pour le retour, ex. Échap qui ne peut pas reprendre). */
    backKey?: string | null;
    wide?: boolean;
    children: Snippet;
  } = $props();
</script>

<div class="veil">
  <div class="panel" class:wide role="dialog" aria-modal="true" aria-label={title} {@attach navScope}>
    <header>
      <div class="titles">
        <h2>{title}</h2>
        {#if subtitle}<p>{subtitle}</p>{/if}
      </div>
      <button type="button" class="back" onclick={onback}><Icon name="back" /> {backLabel}</button>
    </header>
    <div class="body">
      {@render children()}
    </div>
    <footer>
      <NavHints hints={[{ pad: 'confirm', key: 'Entrée', label: 'Valider' }, { pad: 'back', ...(backKey !== null ? { key: backKey } : {}), label: backLabel }]} />
    </footer>
  </div>
</div>

<style>
  .veil {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    box-sizing: border-box;
    background: radial-gradient(ellipse at center, rgb(16 22 74 / 0.55), rgb(10 13 42 / 0.88));
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    width: min(32rem, 100%);
    max-height: 100%;
    padding: 1.2rem 1.4rem 1rem;
    box-sizing: border-box;
    border-radius: var(--r-lg);
    background: linear-gradient(165deg, #2a2563, #16133f 70%);
    box-shadow:
      inset 0 0 0 0.12rem var(--stroke),
      0 0.6rem 0 rgb(0 0 0 / 0.3);
    color: #fff;
  }
  .panel.wide {
    width: min(56rem, 100%);
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  h2 {
    margin: 0;
    font: italic 900 2rem/1 var(--font);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .titles p {
    margin: 0.35rem 0 0;
    font: 700 0.85rem/1.3 var(--font);
    color: var(--text-dim);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex: none;
    padding: 0.45rem 0.8rem;
    border: 0;
    border-radius: var(--r-md);
    background: rgb(255 255 255 / 0.1);
    color: #fff;
    font: 800 0.85rem/1 var(--font);
    cursor: pointer;
  }
  .back:hover {
    background: rgb(255 255 255 / 0.18);
  }
  /* Marge intérieure compensée : l'anneau de focus (outline + offset) des lignes pleine largeur n'est pas rogné par le
     défilement (overflow-y: auto rogne aussi en x). */
  .body {
    min-height: 0;
    overflow-y: auto;
    padding: 0.45rem;
    margin: -0.45rem;
  }
  @media (prefers-reduced-motion: no-preference) {
    .panel {
      animation: panel-in 0.22s cubic-bezier(0.2, 1.3, 0.4, 1);
    }
  }
  @keyframes panel-in {
    from {
      transform: translateY(0.8rem) scale(0.97);
      opacity: 0;
    }
  }
</style>
