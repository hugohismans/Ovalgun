<script lang="ts">
  import { onMount } from 'svelte';
  import { GameSession, type FrameSnapshot } from '../game/session';
  import { actionLabel, ACTION_LABELS, DEFAULT_KEYMAP, loadLayoutLabels, type Action, type LayoutLabels } from '../input/keymap';
  import { DEFAULT_GAMEPAD_MAP, padActionGlyph, type GamepadAction } from '../input/gamepadMap';

  // Étape 3 : partie fixe 3v3, humain ailier, seed fixe. Le menu de lancement arrive à l'étape 8.
  const PARAMS = new URLSearchParams(window.location.search);
  const DEBUG = PARAMS.has('debug');
  // Étape 5 : adversaires = tourelles d'entraînement qui tirent ; ?dummies=off => cibles passives.
  const DUMMIES = PARAMS.get('dummies') !== 'off';

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
  // Retour texte temporaire (étape 4, en attendant le HUD de l'étape 8) : immédiat, pas limité à 10 Hz.
  let toast = $state<FrameSnapshot['feedback']>(null);
  let debugTools = $state(DEBUG);
  // Mini-HUD provisoire (étape 5, le vrai HUD est l'étape 8) et retours de visée : à chaque frame.
  let hud = $state<FrameSnapshot | null>(null);

  onMount(() => {
    const s = new GameSession(canvas, { teamSize: 3, humanRole: 'ailier', seed: 1234, training: true, debug: DEBUG, dummies: DUMMIES });
    session = s;
    s.onFrame = (snap) => {
      // Drapeaux d'overlay : immédiats. Texte de debug : ~10 Hz.
      if (snap.paused !== paused) paused = snap.paused;
      if (snap.activeDevice !== device) device = snap.activeDevice;
      if (snap.gamepadConnected !== padConnected) padConnected = snap.gamepadConnected;
      if (snap.gamepadStyle !== padStyle) padStyle = snap.gamepadStyle;
      if (snap.gamepadIgnored !== padIgnored) padIgnored = snap.gamepadIgnored;
      if (snap.debugTools !== debugTools) debugTools = snap.debugTools;
      if ((snap.feedback?.seq ?? -1) !== (toast?.seq ?? -1)) toast = snap.feedback;
      hud = snap;
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
  /** Outils de test (?debug / entraînement). */
  const DEBUG_KEY_ROW: [string, Action[]] = ['Test : ballon pour moi · au centre', ['debugGiveBall', 'debugResetBall']];
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
  const DEBUG_PAD_ROW: [string, string] = ['Test : ballon pour moi · au centre', 'debugGiveBall+debugResetBall'];

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

  /** Libellé d'un cooldown : « prêt » ou secondes restantes. */
  const cd = (sec: number, ready = 'prêt'): string => (sec > 0.05 ? sec.toFixed(1) + ' s' : ready);
  const pct = (x: number): string => `${Math.max(0, Math.min(1, x)) * 100}%`;

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

{#if !paused && hud}
  {#if hud.combat.vignette > 0.01}
    <div class="vignette" style:opacity={hud.combat.vignette}></div>
  {/if}
  <div class="crosshair" class:aim={hud.aiming}></div>
  {#if hud.combat.hitMarker}
    {#key hud.combat.hitMarker.seq}
      <div class="hitmarker" class:strong={hud.combat.hitMarker.strong} style:--hm-dur="{hud.combat.hitMarker.durationSec}s">
        <i></i><i></i><i></i><i></i>
      </div>
    {/key}
  {/if}
  {#each hud.combat.damage as d (d.key)}
    <div class="dmg" style:transform="rotate({d.angleDeg}deg)" style:opacity={d.alpha}><i></i></div>
  {/each}

  <div class="hud">
    {#if hud.status !== 'active'}
      <div class="down">{hud.status === 'down' ? 'PLAQUÉ' : 'Relevé…'} · {hud.statusSec.toFixed(1)} s</div>
    {/if}
    <div class="stab" class:low={hud.stabilityLow}>
      <span class="lbl">Stabilité</span>
      <span class="bar"><span class="fill" style:width={pct(hud.stability / hud.stabilityMax)}></span></span>
      <span class="num">{Math.max(0, Math.ceil(hud.stability))}</span>
    </div>
    <div class="row">
      <div class="chip ammo" class:off={!hud.canShoot}>
        {#if hud.reloadProgress >= 0}
          <span class="lbl">Rechargement</span>
          <span class="bar small"><span class="fill" style:width={pct(hud.reloadProgress)}></span></span>
        {:else}
          <b>{hud.ammo}</b><span class="dim">/ {hud.magazine}</span>
          {#if hud.carrier}<span class="lbl">porteur : pas de tir</span>{/if}
        {/if}
      </div>
      <div class="chip" class:active={hud.abilityActiveSec > 0} class:ready={hud.abilityImplemented && hud.abilityActiveSec <= 0 && hud.abilityCd <= 0.05}>
        <span class="lbl">{hud.abilityLabel}</span>
        {#if !hud.abilityImplemented}
          <span class="dim">étape 7</span>
        {:else if hud.abilityActiveSec > 0}
          <b>{hud.abilityActiveSec.toFixed(1)} s</b>
          <span class="bar small"><span class="fill" style:width={pct(hud.abilityActiveSec / hud.abilityDurationSec)}></span></span>
        {:else}
          <b>{cd(hud.abilityCd)}</b>
          {#if hud.abilityCd > 0.05}<span class="bar small cool"><span class="fill" style:width={pct(1 - hud.abilityCd / hud.abilityCooldownSec)}></span></span>{/if}
        {/if}
      </div>
      <div class="chip" class:ready={hud.dodgeCd <= 0.05}>
        <span class="lbl">Esquive</span>
        <b>{cd(hud.dodgeCd, 'prête')}</b>
        {#if hud.dodgeCd > 0.05}<span class="bar small cool"><span class="fill" style:width={pct(1 - hud.dodgeCd / hud.dodgeCooldownSec)}></span></span>{/if}
      </div>
    </div>
  </div>
{/if}

{#if info}
  <div class="debug">
    <div><b>{info.speed.toFixed(1)}</b> m/s · {MOVE_LABELS[info.move] ?? info.move}{info.onGround ? '' : ' · en l’air'}{info.sprinting ? ' · sprint' : ''}{info.carrier ? ' · porteur' : ''}</div>
    <div>esquive {info.dodgeCd > 0 ? info.dodgeCd.toFixed(1) + ' s' : 'prête'} · glissade {info.slideCd > 0 ? info.slideCd.toFixed(1) + ' s' : 'prête'}</div>
    {#if info.carrier}
      <div>passe → {info.passTarget >= 0 ? 'coéquipier #' + info.passTarget : 'aucune cible'} · plongeon {info.diveCd > 0 ? info.diveCd.toFixed(1) + ' s' : 'prêt'}</div>
    {/if}
    <div class="dim">{info.fps.toFixed(0)} img/s · tick {info.tick} · {device === 'gamepad' ? 'manette' : 'clavier/souris'}{info.assistTarget >= 0 ? ' · aide visée #' + info.assistTarget : ''}{debugTools ? (device === 'gamepad' ? ' · View : ballon · ↓ : centre' : ' · G : ballon · B : centre') : ''}</div>
  </div>
{/if}

{#if toast && !paused}
  {#key toast.seq}
    <div class="toast {toast.kind}">{toast.text}</div>
  {/key}
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
            {#each debugTools ? [...PAD_ROWS, DEBUG_PAD_ROW] : PAD_ROWS as [label, spec] (label)}
              <tr><td>{label}</td><td><kbd>{glyphs(spec)}</kbd></td></tr>
            {/each}
          {:else}
            {#each debugTools ? [...KEY_ROWS, DEBUG_KEY_ROW] : KEY_ROWS as [label, actions] (label)}
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
  /* Hitmarker : 4 traits en X autour du réticule ; plus grand, plus épais et rouge quand on plaque. */
  .hitmarker {
    position: fixed;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
    animation: hm-pop var(--hm-dur) ease-out forwards; /* STYLE.hitMarkerSec, via le style en ligne */
  }
  .hitmarker i {
    position: absolute;
    left: -1.5px;
    top: -15px;
    width: 3px;
    height: 7px;
    border-radius: 2px;
    background: #fff;
    box-shadow: 0 0 0 1px #000a;
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
  .hitmarker.strong {
    animation: hm-pop-strong var(--hm-dur) ease-out forwards; /* STYLE.hitMarkerStrongSec */
  }
  .hitmarker.strong i {
    top: -22px;
    height: 11px;
    width: 4px;
    left: -2px;
    transform-origin: 2px 22px;
    background: #ff3d5a;
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
  /* Direction des tirs reçus : arc rouge autour du réticule, tourné vers le tireur. */
  .dmg {
    position: fixed;
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
    filter: drop-shadow(0 0 2px #000c);
  }
  .vignette {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(ellipse at center, transparent 45%, #ff1e3c99 100%);
  }
  /* Mini-HUD provisoire (étape 5). */
  .hud {
    position: fixed;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    color: #fff;
    font: 700 13px/1.2 system-ui, sans-serif;
  }
  .hud .down {
    padding: 4px 14px;
    border-radius: 10px;
    background: #ff3d5acc;
    font: 900 18px/1.2 system-ui, sans-serif;
    letter-spacing: 1px;
  }
  .hud .stab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: 10px;
    background: #0d1030b8;
  }
  .hud .bar {
    position: relative;
    display: inline-block;
    width: 220px;
    height: 12px;
    border-radius: 6px;
    background: #ffffff2a;
    overflow: hidden;
  }
  .hud .bar.small {
    width: 64px;
    height: 6px;
  }
  .hud .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: #fff;
    border-radius: inherit;
    transition: width 0.08s linear;
  }
  .hud .stab .fill {
    background: linear-gradient(90deg, #ffe12e, #3dffa0);
  }
  .hud .stab.low .fill {
    background: #ff3d5a;
  }
  .hud .stab.low {
    animation: low-pulse 0.6s ease-in-out infinite alternate;
  }
  @keyframes low-pulse {
    to {
      background: #5a0d1cd0;
    }
  }
  .hud .bar.cool .fill {
    background: #ffffff80;
  }
  .hud .num {
    min-width: 28px;
    text-align: right;
    font-weight: 900;
  }
  .hud .row {
    display: flex;
    gap: 6px;
  }
  .hud .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 10px;
    background: #0d1030b8;
  }
  .hud .chip b {
    font-weight: 900;
  }
  .hud .chip.ammo b {
    font-size: 18px;
  }
  .hud .chip.off {
    opacity: 0.55;
  }
  .hud .chip.ready {
    box-shadow: inset 0 0 0 2px #3dffa0aa;
  }
  .hud .chip.active {
    background: #1d7a4ed0;
  }
  .hud .lbl {
    font-weight: 600;
    opacity: 0.85;
  }
  .hud .dim {
    opacity: 0.6;
    font-weight: 600;
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
  .toast {
    position: fixed;
    left: 50%;
    top: 30%;
    transform: translateX(-50%);
    padding: 6px 16px;
    border-radius: 10px;
    background: #0d1030c8;
    color: #fff;
    font: 900 22px/1.2 system-ui, sans-serif;
    letter-spacing: 0.5px;
    pointer-events: none;
    white-space: nowrap;
    animation: toast-pop 0.18s ease-out;
  }
  .toast.good {
    color: #3dffa0;
  }
  .toast.bad {
    color: #ff6b84;
  }
  .toast.info {
    color: #ffe12e;
  }
  @keyframes toast-pop {
    from {
      transform: translateX(-50%) scale(1.25);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) scale(1);
      opacity: 1;
    }
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
