# Ovalgun

Rugby arcade 3D où chaque joueur porte une arme qui « plaque » à distance : on ne blesse personne, on vide la **jauge de
stabilité** de l'adversaire pour le faire tomber et lui faire lâcher le ballon. Caméra épaule, rythme rapide, style flat
coloré, placeholders géométriques (aucun asset).

Prototype **solo contre bots** (3v3 ou 5v5, trois rôles, mêlée, matchs de 6 minutes ; personnages 3D animés,
son et musique de menu synthétiques), écrit avec Vite + TypeScript +
Three.js + Svelte 5 (runes). Se joue au **clavier / souris ET à la manette** (Xbox, PlayStation, toute manette « standard »
de la Gamepad API). L'architecture est prête pour un mode online à serveur autoritaire (simulation pure et déterministe,
bots producteurs d'entrées) : voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §20.

## Lancer le projet

Node 22.12 ou plus récent (Vitest 5 l'exige ; le build seul tourne dès Node 20.19) et npm.

```bash
npm install          # ou npm ci (installation exacte depuis package-lock.json, comme la CI)
npm run dev          # serveur de développement : http://localhost:5173
npm run check        # vérification complète : typecheck + tests + build
npm run build        # build statique dans dist/
npm run preview      # sert dist/ en local pour vérifier le build
```

Scripts détaillés :

| Script | Rôle |
|---|---|
| `npm run typecheck` | `tsc -p tsconfig.sim.json` (simulation + bots compilés SANS lib DOM) puis `svelte-check` sans avertissement |
| `npm test` | Vitest (environnement node) : simulation, bots, client, UI, architecture |
| `npm run test:watch` | Vitest en continu (pratique pendant un réglage de constantes) |
| `npm run build` | Build de production statique dans `dist/` |
| `npm run check` | Les trois à la suite : c'est ce que vérifie la CI |

## Déploiement statique

Le build est 100 % statique (`dist/`) et utilise `base: './'` (vite.config.ts) : il fonctionne à la racine d'un domaine
comme sous un sous-chemin, sans réglage.

- **GitHub Pages** (workflow fourni, `.github/workflows/pages.yml`, déclenché **à la main** uniquement) :
  1. dans le dépôt GitHub : *Settings → Pages → Build and deployment → Source* : **GitHub Actions** ;
  2. *Actions → Déploiement GitHub Pages → Run workflow* (choisir la branche) ;
  3. le site est publié sur `https://<utilisateur>.github.io/<dépôt>/` (le lien apparaît dans le résumé du workflow).
  Le workflow installe (`npm ci`), vérifie (`npm run check`), puis publie `dist/` avec les permissions minimales
  (build : `contents: read` + `pages: read` ; publication : `pages: write` + `id-token: write`). Si l'environnement
  `github-pages` restreint les branches autorisées (*Settings → Environments*), y ajouter la branche à déployer.
- **Cloudflare Pages** : *Workers & Pages → Create → Pages → Connect to Git*, framework « None », **commande de build**
  `npm run build`, **dossier de sortie** `dist`, variable d'environnement `NODE_VERSION` = `22` (Vite 8 demande
  Node 20.19 ou 22.12 au minimum). Ou en ligne de commande :
  `npm run build && npx wrangler pages deploy dist`.
- N'importe quel hébergeur de fichiers statiques : copier le contenu de `dist/`.

La CI (`.github/workflows/ci.yml`) lance `npm ci`, `npm run typecheck`, `npm test` et `npm run build` sur Node 22 à chaque
push et pull request.

## Jouer

Le jeu s'ouvre sur le **menu de lancement** (un match bots contre bots tourne en fond) :

- **Format** : 3v3 (un pilier, un ailier, un demi par équipe) ou 5v5 (1 pilier, 2 ailiers, 2 demis) ;
- **Rôle** : **pilier** (fusil à pompe, gros dégâts de près ; capacité : bouclier frontal ; le plus lent), **ailier**
  (pistolet-mitrailleur précis ; double saut ; capacité : sprint boosté ; le plus rapide), **demi** (lance-grenades à impact
  qui repousse ; capacité : zone de ralentissement au sol) ;
- **Difficulté des bots** : facile, normal, difficile (temps de réaction, précision, rotation) ;
- **Entraînement** : chrono figé, outils « ballon pour moi » / « ballon au centre » ;
- **JOUER** : Entrée, clic ou Start. Les choix sont mémorisés sur l'appareil (localStorage).

Règles en bref : un **essai** (franchir la ligne d'en-but adverse avec le ballon, plongeon compris) vaut 5 points ; le porteur
ne tire pas, va un peu plus vite, ne passe **qu'en arrière** (visée assistée) et peut taper au pied ou plonger (intouchable
0,3 s) ; jauge vide = plaqué 2,5 s, ballon lâché ; un ballon libre disputé plus de 3 s devient une **mêlée** (zone de
capture : l'équipe la plus nombreuse debout dedans après 3 s gagne le ballon) ; **dernière minute** : cooldowns raccourcis,
ballon plus rapide.

**Pause** : Échap (clavier) ou Start (manette) ; aussi quand la fenêtre perd le focus ou le pointer lock. Menu : Reprendre,
Contrôles, Réglages, Recommencer et Quitter vers le menu (ces deux derniers demandent un second appui). **Fin de match** :
résultat, joueur du match, statistiques, Rejouer / Menu (Start = Rejouer).

## Contrôles

En jeu au clavier, le jeu capture la souris (pointer lock) ; Échap la libère et met en pause. Les touches sont lues par
position physique : sur un clavier QWERTY, Z Q S D deviennent W A S D et A devient Q (le panneau « Contrôles » affiche les
libellés de ta disposition réelle).

| Action | Clavier / souris (AZERTY ; QWERTY entre parenthèses) | Manette Xbox (PlayStation) |
|---|---|---|
| Se déplacer | Z Q S D (W A S D) ou flèches | Stick gauche (analogique : marche lente si peu incliné) |
| Caméra / viser | Souris | Stick droit (aide à la visée près d'un adversaire) |
| Tirer | Clic gauche (maintenu = automatique) | RT (R2) |
| Visée précise (caméra rapprochée) | Clic droit | LT (L2) |
| Sauter (double saut : ailier) | Espace | A (Croix) |
| Esquive | Maj tapé (sans ballon : au relâchement) | B (Rond) |
| Sprint | Maj maintenu (porteur : automatique en avançant) | L3 en bascule (porteur : automatique) |
| Glissade (en courant) / plongeon (porteur) | C | X (Carré) |
| Capacité (second appui : baisser le bouclier) | A (Q) | LB (L1) |
| Recharger | R | Y (Triangle) |
| Passe arrière assistée (porteur) | E | RB (R1) |
| Coup de pied (porteur) | F | Y (Triangle) |
| Pause / reprendre | Échap | Start / Menu (Options) |
| Entraînement : ballon pour moi | G | View (Share) |
| Entraînement : ballon au centre | B | Croix ↓ |

Le côté de la passe se choisit d'un coup d'œil (regarder un peu à gauche = passe à gauche) ; la hauteur du coup de pied
suit le regard vertical.

**Navigation des menus** :

| Geste | Souris / clavier | Manette |
|---|---|---|
| Se déplacer | Souris ; flèches, Tab | Croix ou stick gauche |
| Valider | Clic ; Entrée ou Espace | A (Croix) |
| Retour / fermer un panneau | Échap | B (Rond) |
| Jouer (menu) / reprendre (pause) / rejouer (fin) | Bouton correspondant | Start |
| Varier un curseur (réglages) | Flèches gauche / droite | Croix ou stick gauche / droite |
| Glyphes Xbox / PlayStation (panneau « Contrôles ») | Bascule du panneau | LB / RB |

## Réglages

Panneau « Réglages » (depuis le menu ou la pause), appliqué tout de suite et mémorisé (`ovalgun.settings.v1`) :
- **Souris** : sensibilité, sensibilité en visée (souris et manette, relative à la normale), inversion de l'axe vertical ;
- **Manette** : sensibilité caméra, inversion de l'axe vertical, aide à la visée, vibrations ;
- **Caméra** : champ de vision (vertical, équivalent horizontal 16:9 affiché ; porteur et visée suivent), distance
  (multiplicateur), hauteur (le regard converge vers la droite de tir à 20 m : réticule juste), effet de vitesse (FOV qui
  s'élargit au sprint) ;
- **Graphismes** : qualité Auto (baisse toute seule si ça rame) / Bas / Moyen / Haut (résolution, densité de la foule,
  détails de la ville), compteur d'images par seconde (et ping en ligne) ;
- **Son** : volume général, musique du menu.

 Les réglages de gameplay (vitesses, cooldowns, dégâts, bots…) sont
des constantes de développement : [`src/sim/constants.ts`](src/sim/constants.ts) (voir l'aide-mémoire de
[`docs/TESTING.md`](docs/TESTING.md#aide-mémoire--réglage-du-feeling)).

## Paramètres d'URL (test et debug)

Lus par `src/game/launch.ts`. Les choix de partie dans l'URL priment sur ceux mémorisés par le menu.

| Paramètre | Effet |
|---|---|
| `?debug` | Partie lancée tout de suite sans menu, clavier actif sans pointer lock, pas de pause automatique (focus, pointer lock, manette débranchée), lignes de debug dans le HUD, session exposée dans `window.__ovalgun.session` (console, Playwright), outils G / B disponibles |
| `?debug&menu` | Comme `?debug`, mais en passant par le menu de lancement |
| `?debug&autopilot` | Le joueur 0 est aussi un bot : match bots contre bots vu depuis sa caméra |
| `?debug&duration=20` | Match raccourci à 20 s (écran de fin rapide) ; `?debug` requis |
| `?size=3` / `?size=5` | Format 3v3 / 5v5 |
| `?role=pilier` / `ailier` / `demi` | Rôle du joueur |
| `?difficulty=facile` / `normal` / `difficile` | Difficulté des bots (coéquipiers et adversaires) |
| `?training` (`?training=0` ou `off` pour le couper) | Mode entraînement : chrono figé, G / B (View / croix ↓) pour le ballon |
| `?dummies=off` | Tous les joueurs non humains passifs (cibles immobiles pour régler le plaquage) |

Exemples : `http://localhost:5173/?debug&role=demi&dummies=off`, `…/?debug&autopilot&size=5&difficulty=difficile`.

## Structure du projet

```
src/
  sim/      Simulation PURE et déterministe (tick 30 Hz, MatchState JSON, PRNG seedé) — aucune dépendance au DOM,
            à Three.js ni à Svelte : tourne telle quelle dans un Cloudflare Worker. constants.ts = TOUS les réglages.
  bots/     Bots PURS : lisent le MatchState, renvoient un PlayerInput (comme un humain), ne modifient jamais l'état.
  render/   Three.js : lit deux états et interpole ; caméra épaule ; palette.ts = réglages purement visuels.
  input/    Clavier/souris (pointer lock) et manette (Gamepad API) -> un PlayerInput par tick ; aide à la visée, vibrations.
  game/     Colle côté client : boucle à pas fixe, session (humain + bots), HUD pur, lancement, réglages.
  ui/       Svelte 5 (runes) : menu, HUD, pause, fin, contrôles, réglages (lecture seule de la session).
tests/      Vitest : sim, bots, game, input, render, ui, architecture (règles d'import et de pureté).
scripts/    snap.cjs : capture d'écran headless pour la vérification visuelle (Playwright non inclus).
docs/       Cahier des charges, architecture, guide de test.
```

## Documentation

- Cahier des charges d'origine (fait foi) : [`docs/SPEC.md`](docs/SPEC.md)
- Architecture, contrat de la simulation, décisions étape par étape, brancher le mode online :
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Comment tester chaque étape, constantes de réglage, aide-mémoire du feeling : [`docs/TESTING.md`](docs/TESTING.md)
- Réglages de gameplay : [`src/sim/constants.ts`](src/sim/constants.ts) ; réglages visuels :
  [`src/render/palette.ts`](src/render/palette.ts)
