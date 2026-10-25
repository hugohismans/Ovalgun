<!--
  Messages personnels du joueur local (étape 4, intégrés au HUD de l'étape 8), en bas à droite du réticule (la caméra
  épaule place le joueur à gauche du centre : la zone est libre) : « Aucun coéquipier
  derrière » (passe refusée), « Interception ! », « Plaqué ! Ballon lâché », « Plaquage ! », « Ballon pour toi »…
  (src/game/feedback.ts). Vert = bon, rouge = mauvais, jaune = information.
-->
<script lang="ts">
  import { hud } from '../state/hud.svelte';

  const fb = $derived(hud.snap?.feedback ?? null);
</script>

{#if fb}
  {#key fb.seq}
    <div class="callout {fb.kind}" role="status">{fb.text}</div>
  {/key}
{/if}

<style>
  .callout {
    position: absolute;
    left: calc(50% + 1.6rem);
    top: calc(50% + 1.4rem);
    padding: 0.35rem 1rem;
    border-radius: var(--r-md);
    background: var(--panel);
    color: #fff;
    font: italic 900 1.25rem/1.2 var(--font);
    letter-spacing: 0.02em;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 0.25rem 0 rgb(0 0 0 / 0.25);
  }
  .good {
    color: var(--good);
    box-shadow:
      inset 0 0 0 0.14rem rgb(61 255 160 / 0.5),
      0 0.25rem 0 rgb(0 0 0 / 0.25);
  }
  .bad {
    color: #ff7a93;
    box-shadow:
      inset 0 0 0 0.14rem rgb(255 68 102 / 0.55),
      0 0.25rem 0 rgb(0 0 0 / 0.25);
  }
  .info {
    color: var(--accent);
  }
  @media (prefers-reduced-motion: no-preference) {
    .callout {
      animation: pop 0.2s cubic-bezier(0.2, 1.6, 0.4, 1);
    }
  }
  @keyframes pop {
    from {
      transform: scale(1.3);
      transform-origin: left center;
      opacity: 0;
    }
  }
</style>
