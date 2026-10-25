/**
 * Mini-flèche vers le ballon hors champ (étape 8), PURE et testée.
 *
 * Entrée : la position du ballon dans le REPÈRE CAMÉRA (x à droite, y en haut, la caméra regarde vers −z, comme
 * Three.js), le demi-angle vertical du champ de vision et la taille de l'écran en pixels. Sortie : faut-il une flèche
 * (ballon hors de l'écran, ou derrière la caméra), sa position sur le bord de l'écran (rectangle rentré de marges, en
 * pixels) et son angle à l'écran.
 *
 *  - Ballon DEVANT la caméra : direction = sa projection (coordonnées normalisées), flèche si la projection sort de
 *    l'écran.
 *  - Ballon DERRIÈRE : la projection perspective s'inverse (division par une profondeur négative) ; on prend donc la
 *    direction (x / tan, y / tan) SANS diviser par la profondeur — continue avec le cas « devant » quand le ballon passe
 *    sur le côté (profondeur -> 0) — et, ballon pile derrière, vers le BAS de l'écran (« derrière toi »).
 *  - La flèche est placée là où le rayon centre de l'écran -> direction coupe le rectangle rentré des marges ; si le
 *    rayon traverse avant une zone à éviter (`avoid` : score, jauge et actions, indicateur de rôle), elle s'arrête au bord
 *    de cette zone (ballon pile derrière : juste au-dessus de la jauge ; en diagonale : dans le coin, à côté). Angle
 *    mesuré en pixels (0° = vers la droite, 90° = vers le bas).
 */

/** Marges (px) entre le bord de l'écran et la zone où la flèche peut se placer. */
export interface ScreenInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Rectangle à éviter (px, origine en haut à gauche). */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Paramètre t ≥ 0 où le rayon (ox, oy) + t·(dx, dy) entre dans le rectangle (méthode des dalles), Infinity s'il ne le
 * touche pas. Un rectangle qui contient l'origine est ignoré (Infinity).
 */
export function rayEnterRect(ox: number, oy: number, dx: number, dy: number, r: Readonly<ScreenRect>): number {
  if (ox >= r.x && ox <= r.x + r.w && oy >= r.y && oy <= r.y + r.h) return Infinity;
  let t0 = 0;
  let t1 = Infinity;
  for (const [o, d, lo, hi] of [
    [ox, dx, r.x, r.x + r.w],
    [oy, dy, r.y, r.y + r.h],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let a = (lo - o) / d;
    let b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

export interface OffscreenArrow {
  /** Vrai si le ballon est hors de l'écran (ou derrière la caméra) : la flèche doit être affichée. */
  visible: boolean;
  /** Position de la flèche (px, origine en haut à gauche). */
  x: number;
  y: number;
  /** Angle de la flèche à l'écran (degrés ; 0 = vers la droite, 90 = vers le bas). */
  angleDeg: number;
  /** Ballon derrière la caméra. */
  behind: boolean;
}

/** Profondeur (m) sous laquelle un point est considéré derrière la caméra. */
const MIN_DEPTH = 1e-3;
/** Direction quasi nulle (ballon pile dans l'axe, derrière) : on pointe vers le bas. */
const MIN_DIR = 1e-6;

/**
 * Flèche pour un point en repère caméra (`cx`, `cy`, `cz`), un champ de vision vertical de demi-angle `atan(tanHalfFovY)`
 * et un écran de `width` × `height` px. `avoidMargin` (px) : rayon de la flèche (disque + pointe), dont chaque zone
 * évitée est agrandie.
 */
export function offscreenArrow(
  cx: number,
  cy: number,
  cz: number,
  tanHalfFovY: number,
  width: number,
  height: number,
  insets: Readonly<ScreenInsets>,
  avoid: readonly Readonly<ScreenRect>[] = [],
  avoidMargin = 0,
): OffscreenArrow {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const tanY = Math.max(1e-6, tanHalfFovY);
  const tanX = tanY * (w / h);
  const depth = -cz;
  const behind = depth <= MIN_DEPTH;
  let dx: number;
  let dy: number;
  if (!behind) {
    dx = cx / (depth * tanX);
    dy = cy / (depth * tanY);
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return { visible: false, x: (dx + 1) * 0.5 * w, y: (1 - dy) * 0.5 * h, angleDeg: 0, behind };
  } else {
    dx = cx / tanX;
    dy = cy / tanY;
    if (Math.hypot(dx, dy) < MIN_DIR) {
      dx = 0;
      dy = -1;
    }
  }
  // Direction en pixels (y vers le bas).
  const px = dx * 0.5 * w;
  const py = -dy * 0.5 * h;
  const cxs = w / 2;
  const cys = h / 2;
  const left = Math.min(cxs, insets.left);
  const right = Math.max(cxs, w - insets.right);
  const top = Math.min(cys, insets.top);
  const bottom = Math.max(cys, h - insets.bottom);
  let t = Infinity;
  if (px > 0) t = Math.min(t, (right - cxs) / px);
  else if (px < 0) t = Math.min(t, (left - cxs) / px);
  if (py > 0) t = Math.min(t, (bottom - cys) / py);
  else if (py < 0) t = Math.min(t, (top - cys) / py);
  if (!Number.isFinite(t)) t = 0;
  // Zones agrandies de `avoidMargin` : c'est le CENTRE de la flèche qui s'arrête au bord, son disque et sa pointe
  // (rayon ≈ avoidMargin) ne doivent pas mordre sur la zone (correction de l'étape 8 : étiquette sous le score masquée).
  const m = Math.max(0, avoidMargin);
  for (const r of avoid) t = Math.min(t, rayEnterRect(cxs, cys, px, py, { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }));
  return {
    visible: true,
    x: cxs + px * t,
    y: cys + py * t,
    angleDeg: (Math.atan2(py, px) * 180) / Math.PI,
    behind,
  };
}
