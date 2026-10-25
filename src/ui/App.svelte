<script lang="ts">
  import { onMount } from 'svelte';
  import { GameSession, DEFAULT_BOT_DIFFICULTY, type BotDifficulty, type FrameSnapshot, type TeamSize } from '../game/session';
  import { parseRole } from '../game/roles';
  import { TEAM_COLORS } from '../game/matchHud';
  import { actionLabel, ACTION_LABELS, DEFAULT_KEYMAP, loadLayoutLabels, type Action, type LayoutLabels } from '../input/keymap';
  import { DEFAULT_GAMEPAD_MAP, padActionGlyph, type GamepadAction } from '../input/gamepadMap';

  // Étape 3 : partie fixe 3v3, humain ailier, seed fixe. Le menu de lancement arrive à l'étape 8.
  // Étape 6 : vrai match (chrono, essais, fin) ; ?training => mode entraînement (chrono figé, outils de test).
  const PARAMS = new URLSearchParams(window.location.search);
  const DEBUG = PARAMS.has('debug');
  const TRAINING = PARAMS.has('training');
  // Étape 6 : tous les autres joueurs sont des bots ; ?dummies=off => joueurs passifs (réglage du plaquage).
  const PASSIVE = PARAMS.get('dummies') === 'off';
  // Difficulté des bots (en attendant le menu de l'étape 8) : ?difficulty=facile|normal|difficile.
  const DIFFICULTY_PARAM = PARAMS.get('difficulty');
  const DIFFICULTY: BotDifficulty =
    DIFFICULTY_PARAM === 'facile' || DIFFICULTY_PARAM === 'normal' || DIFFICULTY_PARAM === 'difficile' ? DIFFICULTY_PARAM : DEFAULT_BOT_DIFFICULTY;
  // ?debug&autopilot : le joueur 0 est aussi un bot (observer un match bots contre bots).
  const AUTOPILOT = DEBUG && PARAMS.has('autopilot');
  // Taille d'équipe (en attendant le menu de l'étape 8) : ?size=5 pour du 5v5.
  const TEAM_SIZE: TeamSize = PARAMS.get('size') === '5' ? 5 : 3;
  // Rôle du joueur humain (étape 7, en attendant le menu de l'étape 8) : ?role=pilier|ailier|demi (défaut ailier).
  const ROLE = parseRole(PARAMS.get('role'), 'ailier');

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
    const s = new GameSession(canvas, {
      teamSize: TEAM_SIZE,
      humanRole: ROLE,
      seed: 1234,
      training: TRAINING,
      debug: DEBUG,
      difficulty: DIFFICULTY,
      passive: PASSIVE,
      autopilot: AUTOPILOT,
    });
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

  /** Écran de fin : relance un match (bouton, Entrée / Espace ; A à la manette est géré par la session). */
  function replay(): void {
    if (session === null || !session.ended || !(hud?.match.final?.canReplay ?? false)) return;
    session.restart();
    session.requestPlay();
  }

  function onWindowKey(e: KeyboardEvent): void {
    if (e.repeat || hud?.match.final == null) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      replay();
    }
  }

  const OUTCOME: Record<string, string> = { win: 'VICTOIRE', loss: 'DÉFAITE', draw: 'ÉGALITÉ' };
  const acc = (a: number | null): string => (a === null ? '—' : `${Math.round(a * 100)} %`);

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

<svelte:window onkeydown={onWindowKey} />

<canvas bind:this={canvas}></canvas>

{#if !paused && hud && !hud.match.final}
  {@const m = hud.match}
  <div class="scorebar" style:--t0={TEAM_COLORS[0]} style:--t1={TEAM_COLORS[1]}>
    <span class="team t0" class:mine={m.localTeam === 0}>{m.teamNames[0]}</span>
    <b class="sc t0">{m.score[0]}</b>
    <span class="clock" class:last={m.lastMinute}>{m.training ? 'ENTRAÎNEMENT' : m.clock}</span>
    <b class="sc t1">{m.score[1]}</b>
    <span class="team t1" class:mine={m.localTeam === 1}>{m.teamNames[1]}</span>
  </div>
  {#if m.lastMinute && !m.training}
    <div class="lmtag">DERNIÈRE MINUTE</div>
  {/if}
  {#if m.lastMinuteBanner}
    <div class="banner lm">DERNIÈRE MINUTE</div>
  {/if}
  {#if m.countdown > 0}
    <div class="countdown">
      {#key m.countdown}<span class="num">{m.countdown}</span>{/key}
      <span class="sub" style:color={TEAM_COLORS[m.kickoffTeam]}>
        Coup d’envoi : {m.teamNames[m.kickoffTeam]}{m.kickoffTeam === m.localTeam ? ' (ton équipe)' : ''}
      </span>
    </div>
  {:else if m.scrumCall}
    <div class="banner scrum">MÊLÉE !<span class="hint">entre dans la zone · plaque les adversaires dedans</span></div>
  {:else if m.playCall}
    <div class="countdown"><span class="num go">JOUEZ !</span></div>
  {/if}
  {#if m.tryBanner}
    {@const t = m.tryBanner}
    <div class="banner try" style:--tc={TEAM_COLORS[t.team]}>
      <span class="big">ESSAI !</span>
      <span class="who">{t.teamName} · {t.mine ? 'toi !' : t.scorerLabel}</span>
      <span class="sc"><b style:color={TEAM_COLORS[0]}>{t.score[0]}</b> – <b style:color={TEAM_COLORS[1]}>{t.score[1]}</b></span>
    </div>
  {/if}
  {#if m.scrum}
    {@const sc = m.scrum}
    {@const total = sc.counts[0] + sc.counts[1]}
    <div class="scrumhud" class:ot={sc.overtime} class:lm={m.lastMinute && !m.training} style:--t0={TEAM_COLORS[0]} style:--t1={TEAM_COLORS[1]}>
      <span class="lbl">{sc.overtime ? 'PROLONGATION' : 'MÊLÉE'}</span>
      <div class="cnt">
        <b class="t0">{sc.counts[0]}</b>
        <div class="split"><i style:width={pct(total > 0 ? sc.counts[0] / total : 0.5)}></i></div>
        <b class="t1">{sc.counts[1]}</b>
      </div>
      <div class="time"><i style:width={pct(1 - sc.progress)}></i></div>
      <span class="sub">
        {sc.overtime ? 'premier qui mène · ' : ''}{sc.secLeft.toFixed(1)} s{sc.inZone ? ' · tu comptes' : ''}
      </span>
    </div>
  {/if}
  {#if m.scrumResult}
    {@const r = m.scrumResult}
    <div class="banner scrumres" style:--tc={r.team === -1 ? '#ffffff' : TEAM_COLORS[r.team]}>
      {#if r.team === -1}
        Mêlée : ballon rendu
      {:else}
        Mêlée gagnée par <b>{r.teamName}</b>{r.mine ? ' · ballon pour toi !' : r.ours ? ' (ton équipe)' : ''}
      {/if}
    </div>
  {/if}
{/if}

{#if hud?.match.final}
  {@const f = hud.match.final}
  {@const m = hud.match}
  <div class="overlay end">
    <div class="card endcard">
      <h1 class="outcome {f.outcome}">{OUTCOME[f.outcome]}</h1>
      <div class="final">
        <span style:color={TEAM_COLORS[0]}>{m.teamNames[0]}</span>
        <b>{f.score[0]}</b><span class="dash">–</span><b>{f.score[1]}</b>
        <span style:color={TEAM_COLORS[1]}>{m.teamNames[1]}</span>
      </div>
      <table class="stats">
        <thead>
          <tr><th>Joueur</th><th>Essais</th><th>Plaquages</th><th>Passes</th><th>Interc.</th><th>Précision</th></tr>
        </thead>
        <tbody>
          {#each f.players as p (p.id)}
            <tr class:me={p.local} style:--tc={TEAM_COLORS[p.team]}>
              <td class="who"><i></i>{p.roleLabel} #{p.id}{p.local ? ' (toi)' : ''}</td>
              <td>{p.tries}</td>
              <td>{p.tackles}</td>
              <td>{p.passes}</td>
              <td>{p.interceptions}</td>
              <td>{acc(p.accuracy)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button class="replay" disabled={!f.canReplay} onclick={replay}>Rejouer</button>
      <p class="hint">
        {#if showPad}<kbd>{padActionGlyph(DEFAULT_GAMEPAD_MAP, 'jump', padStyle)}</kbd> pour rejouer{:else}<kbd>Entrée</kbd> ou clic pour rejouer{/if}
      </p>
    </div>
  </div>
{/if}

{#if !paused && hud && !hud.match.final}
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
          <span class="dim">indisponible</span>
        {:else if hud.abilityActiveSec > 0}
          <b>{hud.abilityActiveSec.toFixed(1)} s</b>
          <span class="bar small"><span class="fill" style:width={pct(hud.abilityActiveSec / hud.abilityDurationSec)}></span></span>
          {#if hud.abilityHint}<span class="dim">{hud.abilityHint}</span>{/if}
          {#if hud.abilityCd > 0.05}<span class="dim">· {cd(hud.abilityCd)}</span>{/if}
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
  /* Boucle de match (étape 6) : score / chrono, compte à rebours, bannières, écran de fin. */
  .scorebar {
    position: fixed;
    left: 50%;
    top: 12px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 14px;
    border-radius: 12px;
    background: #0d1030c8;
    color: #fff;
    font: 800 15px/1.2 system-ui, sans-serif;
    pointer-events: none;
    white-space: nowrap;
  }
  .scorebar .team {
    opacity: 0.85;
  }
  .scorebar .team.mine {
    opacity: 1;
    text-decoration: underline 2px;
    text-underline-offset: 3px;
  }
  .scorebar .t0 {
    color: var(--t0);
  }
  .scorebar .t1 {
    color: var(--t1);
  }
  .scorebar .sc {
    min-width: 22px;
    text-align: center;
    font: 900 24px/1 system-ui, sans-serif;
  }
  .scorebar .clock {
    min-width: 64px;
    padding: 2px 8px;
    border-radius: 8px;
    background: #ffffff1c;
    text-align: center;
    font: 900 20px/1.1 ui-monospace, monospace;
  }
  .scorebar .clock.last {
    color: #ff6b84;
    animation: low-pulse 0.6s ease-in-out infinite alternate;
  }
  .lmtag {
    position: fixed;
    left: 50%;
    top: 52px;
    transform: translateX(-50%);
    padding: 2px 10px;
    border-radius: 8px;
    background: #ff3d5acc;
    color: #fff;
    font: 900 12px/1.3 system-ui, sans-serif;
    letter-spacing: 1px;
    pointer-events: none;
  }
  .countdown {
    position: fixed;
    left: 50%;
    top: 24%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    color: #fff;
    text-shadow:
      0 4px 0 #0d1030,
      0 0 18px #0d1030aa;
  }
  .countdown .num {
    font: 900 96px/1 system-ui, sans-serif;
    animation: count-pop 0.35s ease-out;
  }
  .countdown .num.go {
    font-size: 72px;
    color: #3dffa0;
  }
  .countdown .sub {
    padding: 3px 12px;
    border-radius: 10px;
    background: #0d1030c8;
    font: 800 16px/1.3 system-ui, sans-serif;
    text-shadow: none;
  }
  @keyframes count-pop {
    from {
      transform: scale(1.6);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .banner {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
    color: #fff;
    text-align: center;
    animation: banner-pop 0.3s ease-out;
  }
  /* Comme count-pop, mais en gardant le centrage horizontal des bannières (translateX). */
  @keyframes banner-pop {
    from {
      transform: translateX(-50%) scale(1.6);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) scale(1);
      opacity: 1;
    }
  }
  .banner.lm {
    top: 40%;
    padding: 6px 22px;
    border-radius: 12px;
    background: #ff3d5ad8;
    font: 900 34px/1.2 system-ui, sans-serif;
    letter-spacing: 2px;
  }
  .banner.try {
    top: 20%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 34px 12px;
    border-radius: 18px;
    background: #0d1030d8;
    box-shadow: inset 0 0 0 4px var(--tc);
  }
  .banner.try .big {
    font: 900 72px/1 system-ui, sans-serif;
    color: var(--tc);
    text-shadow: 3px 3px 0 #fff3;
  }
  .banner.try .who {
    font: 800 20px/1.2 system-ui, sans-serif;
  }
  .banner.try .sc {
    font: 900 30px/1.2 system-ui, sans-serif;
  }
  .scrumhud {
    position: fixed;
    left: 50%;
    top: 56px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-width: 190px;
    padding: 5px 12px 6px;
    border-radius: 12px;
    background: #0d1030c8;
    box-shadow: inset 0 0 0 2px #ffffff40;
    color: #fff;
    font: 800 13px/1.2 system-ui, sans-serif;
    pointer-events: none;
  }
  .scrumhud.lm {
    top: 80px;
  }
  .scrumhud.ot {
    box-shadow: inset 0 0 0 2px #ffd23e;
    animation: low-pulse 0.35s ease-in-out infinite alternate;
  }
  .scrumhud .lbl {
    font: 900 13px/1 system-ui, sans-serif;
    letter-spacing: 2px;
  }
  .scrumhud.ot .lbl {
    color: #ffd23e;
  }
  .scrumhud .cnt {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .scrumhud .cnt b {
    min-width: 16px;
    text-align: center;
    font: 900 20px/1 system-ui, sans-serif;
  }
  .scrumhud .cnt .t0 {
    color: var(--t0);
  }
  .scrumhud .cnt .t1 {
    color: var(--t1);
  }
  .scrumhud .split {
    flex: 1;
    height: 10px;
    border-radius: 5px;
    background: var(--t1);
    overflow: hidden;
  }
  .scrumhud .split i {
    display: block;
    height: 100%;
    background: var(--t0);
    border-right: 2px solid #0d1030;
    transition: width 0.15s;
  }
  .scrumhud .time {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: #ffffff26;
    overflow: hidden;
  }
  .scrumhud .time i {
    display: block;
    height: 100%;
    background: #fff;
  }
  .scrumhud.ot .time i {
    background: #ffd23e;
  }
  .scrumhud .sub {
    font: 700 11px/1.2 system-ui, sans-serif;
    opacity: 0.85;
  }
  .banner.scrum {
    top: 30%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font: 900 64px/1 system-ui, sans-serif;
    color: #ffd23e;
    text-shadow:
      0 4px 0 #0d1030,
      0 0 18px #0d1030aa;
  }
  .banner.scrum .hint {
    padding: 3px 12px;
    border-radius: 10px;
    background: #0d1030c8;
    color: #fff;
    font: 800 15px/1.3 system-ui, sans-serif;
    text-shadow: none;
  }
  .banner.scrumres {
    top: 30%;
    padding: 8px 22px;
    border-radius: 14px;
    background: #0d1030d8;
    box-shadow: inset 0 0 0 3px var(--tc);
    font: 900 26px/1.2 system-ui, sans-serif;
  }
  .banner.scrumres b {
    color: var(--tc);
  }
  .overlay.end {
    cursor: default;
  }
  .endcard {
    min-width: 480px;
  }
  .outcome.win {
    color: #19b86b;
  }
  .outcome.loss {
    color: #e0294a;
  }
  .outcome.draw {
    color: #6b6890;
  }
  .final {
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 12px;
    margin: 10px 0 14px;
    font: 900 22px/1.2 system-ui, sans-serif;
  }
  .final b {
    font-size: 40px;
  }
  .final .dash {
    opacity: 0.5;
  }
  .stats {
    width: 100%;
    font-size: 14px;
  }
  .stats th {
    padding: 2px 8px;
    font: 700 12px/1.4 system-ui, sans-serif;
    opacity: 0.6;
    text-align: right;
  }
  .stats th:first-child,
  .stats td.who {
    text-align: left;
  }
  .stats td {
    text-align: right;
  }
  .stats td.who i {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 6px;
    border-radius: 50%;
    background: var(--tc);
  }
  .stats tr.me {
    font-weight: 800;
    background: #ffe12e44;
  }
  .replay {
    margin-top: 16px;
    padding: 10px 34px;
    border: 0;
    border-radius: 12px;
    background: #ff7417;
    color: #fff;
    font: 900 20px/1.2 system-ui, sans-serif;
    box-shadow: 0 5px 0 #c94a00;
    cursor: pointer;
  }
  .replay:disabled {
    opacity: 0.5;
    cursor: default;
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
