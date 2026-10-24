<script lang="ts">
  import { onMount } from 'svelte';
  import { GameSession, type FrameSnapshot } from '../game/session';
  import { actionLabel, ACTION_LABELS, DEFAULT_KEYMAP, loadLayoutLabels, type Action, type LayoutLabels } from '../input/keymap';
  import { DEFAULT_GAMEPAD_MAP, padActionGlyph, type GamepadAction } from '../input/gamepadMap';

  // Étape 3 : partie fixe 3v3, humain ailier, seed fixe. Le menu de lancement arrive à l'étape 8.
  const DEBUG = new URLSearchParams(window.location.search).has('debug');

  let canvas: HTMLCanvasElement;
  let session: GameSession | null = null;
  let layout = $state<LayoutLabels | null>(null);
  let paused = $state(!DEBUG);
  let device = $state<'keyboard' | 'gamepad'>('keyboard');
  let padConnected = $state(false);
  let padStyle = $state<'xbox' | 'playstation'>('xbox');
  let padIgnored = $state(false);
  let info = $state<FrameSnapshot | null>(null);
  let lastInfoAt = 0;

  onMount(() => {
    const s = new GameSession(canvas, { teamSize: 3, humanRole: 'ailier', seed: 1234, training: true, debug: DEBUG });
    session = s;
    s.onFrame = (snap) => {
      // Drapeaux d'overlay : immédiats. Texte de debug : ~10 Hz.
      if (snap.paused !== paused) paused = snap.paused;
      if (snap.activeDevice !== device) device = snap.activeDevice;
      if (snap.gamepadConnected !== padConnected) padConnected = snap.gamepadConnected;
      if (snap.gamepadStyle !== padStyle) padStyle = snap.gamepadStyle;
      if (snap.gamepadIgnored !== padIgnored) padIgnored = snap.gamepadIgnored;
      const now = performance.now();
      if (now - lastInfoAt > 100) {
        lastInfoAt = now;
        info = snap;
      }
    };
    s.start();
    loadLayoutLabels().then((l) => (layout = l));
    return () => {
      s.dispose();
      session = null;
    };
  });

  const showPad = $derived(device === 'gamepad');

  const KEY_ROWS: Array<[string, Action[]]> = [
    ['Se déplacer', ['forward', 'left', 'back', 'right']],
    ['Saut', ['jump']],
    [ACTION_LABELS.dodgeSprint, ['dodgeSprint']],
    [ACTION_LABELS.slide, ['slide']],
    ['Tir / visée', ['fire', 'aim']],
    ['Passe · coup de pied', ['pass', 'kick']],
    ['Capacité · recharger', ['ability', 'reload']],
  ];
  const PAD_ROWS: Array<[string, string]> = [
    ['Se déplacer · caméra', 'Stick G · Stick D'],
    ['Saut', 'jump'],
    ['Esquive', 'dodge'],
    ['Sprint (bascule)', 'sprintToggle'],
    ['Glissade / plongeon (porteur)', 'slide'],
    ['Tir / visée', 'fire+aim'],
    ['Passe · coup de pied / recharger', 'pass+kick'],
    ['Capacité · pause', 'ability+pause'],
  ];

  const keys = (actions: Action[]): string => {
    const labels = actions.map((a) => actionLabel(DEFAULT_KEYMAP, a, layout));
    return labels.join(labels.every((l) => l.length === 1) ? ' ' : ' · ');
  };
  const glyphs = (spec: string): string =>
    spec.includes('Stick')
      ? spec
      : spec
          .split('+')
          .map((a) => padActionGlyph(DEFAULT_GAMEPAD_MAP, a as GamepadAction, padStyle))
          .join(' · ');

  function play(): void {
    session?.requestPlay();
  }

  const MOVE_LABELS: Record<string, string> = {
    run: 'course',
    dodge: 'esquive',
    slide: 'glissade',
    dive: 'plongeon',
    dive_recover: 'au sol',
    climb: 'grimpe',
  };
</script>

<canvas bind:this={canvas}></canvas>

{#if !paused}
  <div class="crosshair" class:aim={info?.aiming}></div>
{/if}

{#if info}
  <div class="debug">
    <div><b>{info.speed.toFixed(1)}</b> m/s · {MOVE_LABELS[info.move] ?? info.move}{info.onGround ? '' : ' · en l’air'}{info.sprinting ? ' · sprint' : ''}{info.carrier ? ' · porteur' : ''}</div>
    <div>esquive {info.dodgeCd > 0 ? info.dodgeCd.toFixed(1) + ' s' : 'prête'} · glissade {info.slideCd > 0 ? info.slideCd.toFixed(1) + ' s' : 'prête'}</div>
    <div class="dim">{info.fps.toFixed(0)} img/s · tick {info.tick} · {device === 'gamepad' ? 'manette' : 'clavier/souris'}{info.assistTarget >= 0 ? ' · aide visée #' + info.assistTarget : ''}</div>
  </div>
{/if}

{#if paused}
  <div
    class="overlay"
    role="button"
    tabindex="0"
    onclick={play}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') play();
    }}
  >
    <div class="card">
      <h1>OVALGUN</h1>
      <p class="cta">
        {#if showPad}
          Appuie sur <kbd>{padActionGlyph(DEFAULT_GAMEPAD_MAP, 'jump', padStyle)}</kbd> ou
          <kbd>{padActionGlyph(DEFAULT_GAMEPAD_MAP, 'pause', padStyle)}</kbd> pour jouer
        {:else}
          Clique pour jouer
        {/if}
      </p>
      <table>
        <tbody>
          {#if showPad}
            {#each PAD_ROWS as [label, spec] (label)}
              <tr><td>{label}</td><td><kbd>{glyphs(spec)}</kbd></td></tr>
            {/each}
          {:else}
            {#each KEY_ROWS as [label, actions] (label)}
              <tr><td>{label}</td><td><kbd>{keys(actions)}</kbd></td></tr>
            {/each}
          {/if}
        </tbody>
      </table>
      <p class="hint">
        {#if showPad}Manette détectée · la souris et le clavier restent utilisables{:else}{padConnected
            ? 'Manette branchée : appuie sur un bouton pour l’utiliser · '
            : ''}Échap pour mettre en pause{/if}
      </p>
      {#if padIgnored && !padConnected}
        <p class="hint warn">Manette détectée mais non reconnue (disposition non « standard ») : essaie Chrome ou Edge.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  canvas {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    display: block;
  }
  .crosshair {
    position: fixed;
    left: 50%;
    top: 50%;
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
    pointer-events: none;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow:
      0 0 0 1.5px #0008,
      inset 0 0 0 1.5px #0006;
    transition: transform 0.12s;
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
    box-shadow: 0 0 0 1px #0008;
  }
  .crosshair.aim {
    transform: scale(0.65);
  }
  .debug {
    position: fixed;
    left: 12px;
    bottom: 12px;
    padding: 6px 10px;
    border-radius: 8px;
    background: #0d1030a8;
    color: #fff;
    font: 600 13px/1.45 system-ui, sans-serif;
    pointer-events: none;
  }
  .debug .dim {
    opacity: 0.7;
    font-weight: 500;
  }
  .overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: radial-gradient(ellipse at center, #10164a66, #0a0d2acc);
    cursor: pointer;
  }
  .card {
    min-width: 340px;
    padding: 22px 28px;
    border-radius: 18px;
    background: #ffffffee;
    color: #1d1a33;
    box-shadow: 0 10px 0 #0003;
    text-align: center;
  }
  h1 {
    margin: 0;
    font: 900 44px/1 system-ui, sans-serif;
    letter-spacing: 1px;
    color: #ff7417;
    text-shadow: 3px 3px 0 #1f8cff;
  }
  .cta {
    margin: 10px 0 14px;
    font: 800 20px/1.2 system-ui, sans-serif;
  }
  table {
    margin: 0 auto;
    border-collapse: collapse;
    font: 500 14px/1.5 system-ui, sans-serif;
    text-align: left;
  }
  td {
    padding: 2px 8px;
  }
  td:last-child {
    text-align: right;
  }
  kbd {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 6px;
    background: #1d1a33;
    color: #fff;
    font: 700 13px/1.4 system-ui, sans-serif;
  }
  .hint {
    margin: 12px 0 0;
    font: 500 12px/1.3 system-ui, sans-serif;
    opacity: 0.65;
  }
  .hint.warn {
    color: #ffd27a;
    opacity: 0.95;
  }
</style>
