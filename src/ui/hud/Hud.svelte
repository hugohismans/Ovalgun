<!--
  HUD en jeu (étape 8) : assemble les sous-composants. Deux calques :
   - plein écran : réticule / retours de visée et mini-flèche du ballon (positions en pixels du canvas) ;
   - zone sûre centrée (au plus HUD_MAX_ASPECT de large : en 21:9, les coins restent près du centre, comme en 16:9) :
     score et chrono, mêlée, flux d'événements, outils d'entraînement, rôle, jauge de stabilité et actions, annonces.
  Aucune logique de jeu : tout est lu dans l'instantané de la session (hud.svelte.ts).
-->
<script lang="ts">
  import { hud } from '../state/hud.svelte';
  import ActionBar from './ActionBar.svelte';
  import Announcer from './Announcer.svelte';
  import BallArrow from './BallArrow.svelte';
  import Callout from './Callout.svelte';
  import Crosshair from './Crosshair.svelte';
  import DebugInfo from './DebugInfo.svelte';
  import EventFeed from './EventFeed.svelte';
  import RoleBadge from './RoleBadge.svelte';
  import ScoreBar from './ScoreBar.svelte';
  import ScrumMeter from './ScrumMeter.svelte';
  import StabilityGauge from './StabilityGauge.svelte';
  import TrainingTools from './TrainingTools.svelte';

  /** Masqué (pause, attente du pointer lock) sans être démonté : les animations ne repartent pas à la reprise. */
  let { hidden = false }: { hidden?: boolean } = $props();

  const s = $derived(hud.snap);
</script>

<div class="hud" class:hidden aria-hidden={hidden}>
  <div class="layer">
    <Crosshair />
    <BallArrow />
  </div>
  <div class="safe">
    <ScoreBar />
    <ScrumMeter />
    <div class="top-left">
      {#if s?.debugTools}<TrainingTools />{/if}
    </div>
    <div class="top-right"><EventFeed /></div>
    <Announcer />
    <Callout />
    <div class="bottom-left">
      {#if s?.debug}<DebugInfo />{/if}
      <RoleBadge />
    </div>
    <div class="bottom-center">
      <StabilityGauge />
      <ActionBar />
    </div>
  </div>
</div>

<style>
  .hud {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  /* visibility (et non display: none, qui relancerait les animations CSS au retour). */
  .hud.hidden {
    visibility: hidden;
  }
  .layer {
    position: absolute;
    inset: 0;
  }
  .safe {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: min(100vw, 100vh * 2.05);
    transform: translateX(-50%);
  }
  .top-left {
    position: absolute;
    left: 1rem;
    top: 1rem;
  }
  .top-right {
    position: absolute;
    right: 1rem;
    top: 1rem;
  }
  .bottom-left {
    position: absolute;
    left: 1rem;
    bottom: 1rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .bottom-center {
    position: absolute;
    left: 50%;
    bottom: 0.9rem;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
  }
  /* Petites fenêtres : le rôle passe au-dessus du flux pour laisser la place aux actions. */
  @media (max-width: 1000px) {
    .bottom-left {
      bottom: auto;
      top: 5.2rem;
    }
  }
</style>
