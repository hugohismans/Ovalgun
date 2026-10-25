<!--
  Mini-flèche vers le ballon hors champ (étape 8) : sur le bord de l'écran, orientée vers la projection du ballon
  (ballon derrière la caméra géré par offscreenArrow, src/game/ballArrow.ts), couleur selon l'état — libre (jaune), porté
  par un allié / un adversaire (couleur de son équipe), mêlée (doré) — avec la distance. Lue à chaque frame (`hud.fast`).
  Zones évitées (la flèche, disque et pointe compris, s'arrête à leur bord) : score et son étiquette (haut), jauge et actions (bas), indicateur de rôle (bas à
  gauche), placées comme dans Hud.svelte (zone sûre centrée) ; tailles en rem (taille de base fluide).
-->
<script lang="ts">
  import { offscreenArrow } from '../../game/ballArrow';
  import Icon from '../common/Icon.svelte';
  import { hud } from '../state/hud.svelte';

  /** Marge (rem) entre la flèche et les bords de l'écran (≥ ARROW_REACH_REM : la pointe reste à l'écran). */
  const EDGE_REM = 2.6;
  /** Portée de la flèche autour de son centre (rem) : disque (1,6) + pointe (1,25 + 1,05 ≈ 2,3) ; marge des zones évitées. */
  const ARROW_REACH_REM = 2.4;
  /** Zones du HUD à éviter (rem) : score (demi-largeur, hauteur), jauge + actions (demi-largeur, hauteur), rôle. */
  const SCORE = { halfW: 15, h: 6.2 };
  const BOTTOM = { halfW: 19.5, h: 11.6 };
  const ROLE = { w: 18, h: 5.6 };
  /** Largeur max de la zone sûre (× hauteur), comme Hud.svelte. */
  const SAFE_ASPECT = 2.05;

  let rem = $state(16);
  $effect(() => {
    const read = (): void => {
      rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  });

  const s = $derived(hud.snap);
  const b = $derived(hud.fast?.ball ?? null);
  const arrow = $derived.by(() => {
    if (b === null) return null;
    const W = b.width;
    const H = b.height;
    const edge = EDGE_REM * rem;
    const safeLeft = (W - Math.min(W, H * SAFE_ASPECT)) / 2;
    const avoid = [
      { x: W / 2 - SCORE.halfW * rem, y: 0, w: 2 * SCORE.halfW * rem, h: SCORE.h * rem },
      { x: W / 2 - BOTTOM.halfW * rem, y: H - BOTTOM.h * rem, w: 2 * BOTTOM.halfW * rem, h: BOTTOM.h * rem },
      { x: safeLeft, y: H - ROLE.h * rem, w: ROLE.w * rem, h: ROLE.h * rem },
    ];
    return offscreenArrow(b.cam.x, b.cam.y, b.cam.z, b.tanHalfFovY, W, H, { top: edge, bottom: edge, left: edge, right: edge }, avoid, ARROW_REACH_REM * rem);
  });
  const color = $derived.by(() => {
    if (b === null || s === null) return '#fff';
    const mine = s.team === 0 ? 'var(--t0)' : 'var(--t1)';
    const theirs = s.team === 0 ? 'var(--t1)' : 'var(--t0)';
    return b.holder === 'ally' ? mine : b.holder === 'enemy' ? theirs : b.holder === 'scrum' ? '#ffd23e' : 'var(--accent)';
  });
  const LABELS: Record<string, string> = { free: 'Ballon libre', ally: 'Ballon allié', enemy: 'Ballon adverse', scrum: 'Mêlée' };
</script>

{#if b && arrow && arrow.visible && s && !s.paused}
  <div class="arrow" style:left="{arrow.x}px" style:top="{arrow.y}px" style:--c={color} aria-label="{LABELS[b.holder] ?? 'Ballon'} à {Math.round(b.distance)} m">
    <div class="pointer" style:transform="rotate({arrow.angleDeg}deg)"><i></i></div>
    <div class="core">
      <Icon name={b.holder === 'scrum' ? 'scrum' : 'ball'} size="1.15rem" />
      <b>{Math.round(b.distance)} m</b>
    </div>
  </div>
{/if}

<style>
  .arrow {
    position: absolute;
    width: 0;
    height: 0;
    pointer-events: none;
    color: var(--c);
  }
  .pointer {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
  }
  /* Chevron plein qui dépasse du disque, du côté du ballon (rotation : 0° = droite). */
  .pointer i {
    position: absolute;
    left: 1.25rem;
    top: -0.8rem;
    width: 0;
    height: 0;
    border-top: 0.8rem solid transparent;
    border-bottom: 0.8rem solid transparent;
    border-left: 1.05rem solid var(--c);
    filter: drop-shadow(0 0 0.15rem rgb(0 0 0 / 0.7));
  }
  .core {
    position: absolute;
    left: -1.6rem;
    top: -1.6rem;
    width: 3.2rem;
    height: 3.2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.05rem;
    border-radius: 50%;
    background: rgb(15 13 43 / 0.85);
    box-shadow:
      inset 0 0 0 0.18rem var(--c),
      0 0.2rem 0 rgb(0 0 0 / 0.3);
    --icon-cut: rgb(15 13 43);
  }
  .core b {
    font: 900 0.68rem/1 var(--font);
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
</style>
