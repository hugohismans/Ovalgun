<!--
  Racine de l'UI (étape 8) : canvas 3D + routeur d'écrans. menu -> partie (HUD) -> pause -> fin -> menu.
  L'état et les transitions sont dans state/app.svelte.ts (session : GameSession de ../game/session) ; l'instantané de la
  session dans state/hud.svelte.ts ; la navigation au focus (clavier / manette) dans state/nav.svelte.ts.
  Clavier dans les menus : flèches = navigation spatiale (sauf gauche / droite sur un curseur), Tab / Entrée natifs,
  Échap = retour. En jeu sans pointer lock (?debug, ou partie à la manette) : Échap met en pause.
  Passe finale : le HUD reste monté pendant toute la partie (masqué en pause : le remonter rejouait les animations de
  tir reçu et de score) ; curseur de la souris masqué quand on joue à la manette.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { FrameSnapshot } from '../game/session';
  import { TEAM_COLORS } from '../game/matchHud';
  import ControlsPanel from './ControlsPanel.svelte';
  import EndScreen from './EndScreen.svelte';
  import Hud from './hud/Hud.svelte';
  import Menu from './menu/Menu.svelte';
  import PauseMenu from './PauseMenu.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import { app } from './state/app.svelte';
  import { hud } from './state/hud.svelte';
  import { nav } from './state/nav.svelte';

  let canvas: HTMLCanvasElement;

  onMount(() => app.init(canvas));

  const s = $derived<FrameSnapshot | null>(hud.snap);
  const inGameScreen = $derived(app.screen === 'game' && s !== null && s.mode === 'play');
  const ended = $derived(inGameScreen && s !== null && s.ended);
  const paused = $derived(inGameScreen && s !== null && s.paused && !s.ended && !s.awaitingLock);
  const playing = $derived(inGameScreen && s !== null && !s.paused && !s.ended);

  const ARROWS: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function onKeydown(e: KeyboardEvent): void {
    if (app.menuOpen) {
      const dir = ARROWS[e.key];
      if (dir !== undefined) {
        const a = document.activeElement;
        // Gauche / droite sur un curseur : comportement natif (il varie d'un pas).
        if ((dir === 'left' || dir === 'right') && a instanceof HTMLInputElement && a.type === 'range') {
          nav.setVisible(true);
          return;
        }
        e.preventDefault();
        nav.move(dir);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        app.back(true);
      } else if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') {
        nav.setVisible(true);
      }
      return;
    }
    // En jeu : Échap met en pause quand la souris n'est pas verrouillée (?debug, partie à la manette) ; sinon le navigateur
    // libère le verrou et la session se met en pause d'elle-même.
    if (playing && e.key === 'Escape' && (s?.debug === true || s?.pointerLocked !== true)) {
      e.preventDefault();
      app.pause();
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) nav.setVisible(false);
  }
</script>

<svelte:window onkeydown={onKeydown} onpointermove={onPointerMove} />

<div class="root" class:pad-play={playing && app.device === 'gamepad'} style:--t0={TEAM_COLORS[0]} style:--t1={TEAM_COLORS[1]}>
  <canvas bind:this={canvas} tabindex="-1"></canvas>

  {#if inGameScreen && !ended}
    <Hud hidden={!playing} />
  {/if}

  {#if app.screen === 'menu'}
    <Menu />
  {:else if ended}
    <EndScreen />
  {:else if paused && app.panel === null}
    <PauseMenu />
  {/if}

  {#if app.panel === 'controls'}
    <ControlsPanel />
  {:else if app.panel === 'settings'}
    <SettingsPanel />
  {/if}
</div>

<style>
  .root {
    position: fixed;
    inset: 0;
  }
  /* À la manette, aucun pointer lock : le curseur resterait figé par-dessus le jeu (souvent sur la jauge). Un clic sur le
     jeu (pointer lock, clavier actif) ou la pause le rendent. */
  .root.pad-play,
  .root.pad-play canvas {
    cursor: none;
  }
  canvas {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    display: block;
  }
</style>
