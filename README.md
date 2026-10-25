# Ovalgun

Rugby arcade 3D où chaque joueur porte une arme qui « plaque » à distance.
Prototype solo contre bots — Vite + TypeScript + Three.js + Svelte 5. Clavier/souris ET manette (Xbox, PlayStation).

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + tests + build
npm run build      # build statique dans dist/ (GitHub Pages / Cloudflare Pages)
```

## Lancer une partie

Le jeu s'ouvre sur le **menu de lancement** (un match bots contre bots tourne en fond) : format **3v3** ou **5v5**, **rôle**
(pilier : fusil à pompe et bouclier ; ailier : pistolet-mitrailleur et sprint boosté ; demi : lance-grenades et zone de
ralentissement), **difficulté des bots**, **mode entraînement** (chrono figé, outils « ballon pour moi / au centre »), puis
**JOUER** (Entrée, clic, ou Start à la manette). Les choix sont mémorisés sur l'appareil.

Au clavier, le jeu capture la souris (pointer lock) ; Échap la libère et ouvre la **pause** : Reprendre, Contrôles, Réglages,
Recommencer, Quitter vers le menu (ces deux derniers demandent un second appui). À la manette, **Start** met en pause et
reprend. En fin de match : résultat, joueur du match, statistiques, **Rejouer** / **Menu**.

Navigation des menus : souris ; clavier (flèches, Tab, Entrée / Espace, Échap = retour) ; manette (croix ou stick gauche,
A = valider, B = retour, Start = jouer / reprendre / rejouer, LB / RB = glyphes Xbox / PlayStation dans « Contrôles »).

## Contrôles

| Action | Clavier / souris (AZERTY ; QWERTY entre parenthèses) | Manette |
|---|---|---|
| Se déplacer | Z Q S D (W A S D) ou flèches | Stick gauche |
| Caméra / visée | Souris | Stick droit (aide à la visée) |
| Tirer / viser | Clic gauche / clic droit | RT / LT (R2 / L2) |
| Sauter | Espace | A (Croix) |
| Esquive (appui bref) / sprint (maintien) | Maj | B (Rond) ; sprint : L3 |
| Glissade (plongeon si porteur) | C | X (Carré) |
| Capacité (second appui : baisser le bouclier) | A (Q) | LB (L1) |
| Recharger / coup de pied (porteur) | R / F | Y (Triangle) |
| Passe arrière assistée (porteur) | E | RB (R1) |
| Pause | Échap | Start (Options) |
| Entraînement : ballon pour moi / au centre | G / B | View (Share) / croix ↓ |

Le panneau « Contrôles » (menu ou pause) liste toutes les correspondances avec les libellés de ta disposition de clavier.

## Réglages

Panneau « Réglages » (menu ou pause), appliqués tout de suite et mémorisés : sensibilité souris, sensibilité caméra manette,
inversion de l'axe vertical (manette), aide à la visée, vibrations ; volume réservé (pas encore de son).

## Pour tester et déboguer

- `?debug` : partie lancée tout de suite, sans pointer lock, session dans `window.__ovalgun.session` ; `?debug&menu` passe par
  le menu ; `?debug&duration=20` raccourcit le match ; `?debug&autopilot` : match bots contre bots vu depuis le joueur 0.
- `?size=5`, `?role=pilier|ailier|demi`, `?difficulty=facile|normal|difficile`, `?training`, `?dummies=off` (cibles passives).
- Comment tester chaque étape et constantes de réglage : [`docs/TESTING.md`](docs/TESTING.md).

## Documentation

- Cahier des charges : [`docs/SPEC.md`](docs/SPEC.md)
- Architecture et décisions : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Réglages de gameplay : [`src/sim/constants.ts`](src/sim/constants.ts) ; réglages visuels : [`src/render/palette.ts`](src/render/palette.ts)
