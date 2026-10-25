<!--
  Retours de visée (étape 5, intégrés au HUD de l'étape 8) : réticule (resserré en visée, atténué quand on ne peut pas
  tirer), hitmarker (plus grand et rouge sur un plaquage), indicateurs de direction des tirs reçus, vignette rouge de
  stabilité basse + flash à chaque tir reçu. Lus à chaque frame (`hud.fast`, combatHud.ts).
-->
<script lang="ts">
  import { hud } from '../state/hud.svelte';

  const f = $derived(hud.fast);
  const canShoot = $derived(hud.snap?.canShoot ?? true);
</script>

{#if f}
  {#if f.combat.vignette > 0.01}
    <div class="vignette" style:opacity={f.combat.vignette}></div>
  {/if}
  <div class="crosshair" class:aim={f.aiming} class:off={!canShoot}></div>
  {#if f.combat.hitMarker}
    {#key f.combat.hitMarker.seq}
      <div class="hitmarker" class:strong={f.combat.hitMarker.strong} style:--hm-dur="{f.combat.hitMarker.durationSec}s">
        <i></i><i></i><i></i><i></i>
      </div>
    {/key}
  {/if}
  {#each f.combat.damage as d (d.key)}
    <div class="dmg" style:transform="rotate({d.angleDeg}deg)" style:opacity={d.alpha}><i></i></div>
  {/each}
{/if}

<style>
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(ellipse at center, transparent 45%, rgb(255 30 60 / 0.6) 100%);
  }
  .crosshair {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
    pointer-events: none;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow:
      0 0 0 1.5px rgb(0 0 0 / 0.5),
      inset 0 0 0 1.5px rgb(0 0 0 / 0.4);
    transition:
      transform 0.12s,
      opacity 0.2s;
  }
  .crosshair::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 4px;
    height: 4px;
    margin: -2px 0 0 -2px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.5);
  }
  .crosshair.aim {
    transform: scale(0.65);
  }
  .crosshair.off {
    opacity: 0.35;
  }
  /* Hitmarker : 4 traits en X autour du réticule ; plus grand, plus épais et rouge quand on plaque. */
  .hitmarker {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
    animation: hm-fade var(--hm-dur) ease-out forwards; /* STYLE.hitMarkerSec, via le style en ligne */
  }
  .hitmarker i {
    position: absolute;
    left: -1.5px;
    top: -15px;
    width: 3px;
    height: 7px;
    border-radius: 2px;
    background: #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.65);
    transform-origin: 1.5px 15px;
  }
  .hitmarker i:nth-child(1) {
    transform: rotate(45deg);
  }
  .hitmarker i:nth-child(2) {
    transform: rotate(135deg);
  }
  .hitmarker i:nth-child(3) {
    transform: rotate(225deg);
  }
  .hitmarker i:nth-child(4) {
    transform: rotate(315deg);
  }
  .hitmarker.strong i {
    top: -22px;
    height: 11px;
    width: 4px;
    left: -2px;
    transform-origin: 2px 22px;
    background: #ff3d5a;
  }
  /* Direction des tirs reçus : arc rouge autour du réticule, tourné vers le tireur. */
  .dmg {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .dmg i {
    position: absolute;
    left: -34px;
    top: -118px;
    width: 68px;
    height: 22px;
    border-radius: 50% 50% 0 0 / 100% 100% 0 0;
    border-top: 6px solid #ff3d5a;
    filter: drop-shadow(0 0 2px rgb(0 0 0 / 0.8));
  }
  @keyframes hm-fade {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .hitmarker {
      animation-name: hm-pop;
    }
    .hitmarker.strong {
      animation-name: hm-pop-strong;
    }
  }
  @keyframes hm-pop {
    from {
      transform: scale(1.5);
      opacity: 1;
    }
    to {
      transform: scale(1);
      opacity: 0;
    }
  }
  @keyframes hm-pop-strong {
    0% {
      transform: scale(2) rotate(0deg);
      opacity: 1;
    }
    60% {
      opacity: 1;
    }
    100% {
      transform: scale(1.1) rotate(10deg);
      opacity: 0;
    }
  }
</style>
