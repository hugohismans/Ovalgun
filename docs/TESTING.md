# Ovalgun — Guide de test et de réglage

Ce guide dit, étape par étape, **comment tester** ce qui vient d'être livré, **ce qu'on doit ressentir ou voir**, et
**quelles constantes toucher** pour ajuster le feeling. Toutes les constantes de gameplay sont dans
`src/sim/constants.ts` (une modification est prise en compte au prochain `npm test` ou rechargement de `npm run dev`) ;
les réglages purement visuels dans `src/render/palette.ts`.
Vérification complète du projet : `npm run check` (typecheck + tests + build), la même que la CI.

**Comment lire ce guide.** Chaque section décrit le jeu **tel qu'il était à la livraison de l'étape** (par exemple, aux
étapes 3 à 5 les autres joueurs sont des plots ou des tourelles) ; ce qui a changé ensuite est signalé entre parenthèses
(« depuis l'étape 7 », « passe finale »…). Les colonnes « Valeur actuelle » des tableaux sont, elles, à jour avec
`src/sim/constants.ts` (vérifiées à la passe finale). Pour refaire aujourd'hui le test d'une ancienne étape : le menu lance
la partie, et les paramètres d'URL de debug donnent les mêmes conditions — `?debug&training` (partie directe, chrono figé,
G / B pour le ballon), `?dummies=off` (plots passifs), `?role=…`, `?size=5` ; la liste complète est dans le README.
Pour régler vite le feeling, commencer par l'[aide-mémoire](#aide-mémoire--réglage-du-feeling) en fin de document.

## Sommaire

- [Étape 1 — squelette](#étape-1--squelette)
- [Étape 2 — simulation : joueurs, mouvement, ballon et terrain](#étape-2--simulation--joueurs-mouvement-ballon-et-terrain)
- [Étape 3 — rendu minimal, caméra épaule, interpolation, clavier/souris et manette](#étape-3--rendu-minimal-caméra-épaule-interpolation-claviersouris-et-manette)
- [Étape 4 — porteur : passe arrière assistée, coup de pied, plongeon, ramassage](#étape-4--porteur--passe-arrière-assistée-coup-de-pied-plongeon-ramassage)
- [Étape 5 — stabilité, plaquage et tir de l'ailier](#étape-5--stabilité-plaquage-et-tir-de-lailier)
- [Étape 6 — boucle de match complète et bots](#étape-6--boucle-de-match-complète-et-bots)
- [Étape 7 — rôles pilier et demi, mêlée](#étape-7--rôles-pilier-et-demi-mêlée)
- [Étape 8 — HUD et menu](#étape-8--hud-et-menu)
- [Passe finale — simulation et bots](#passe-finale--simulation-et-bots)
- [Passe finale — client, caméra et UI](#passe-finale--client-caméra-et-ui)
- [Passe finale — documentation, CI et contrôle final](#passe-finale--documentation-ci-et-contrôle-final)
- [Aide-mémoire : réglage du feeling](#aide-mémoire--réglage-du-feeling)

## Étape 1 — squelette

Le projet existe : Vite + TypeScript + Three.js + Svelte 5, dossiers `src/sim`, `src/bots`, `src/render`, `src/input`,
`src/game`, `src/ui`, contrat de données de la simulation (`types.ts`, `constants.ts` documenté, PRNG seedé `prng.ts`, maths
vectorielles `vec.ts`), contrat d'entrée clavier ET manette (bouton `RELOAD`, constantes de Maj appui / maintien, zones
mortes, courbe de caméra, aide à la visée, vibrations) et garde-fous d'architecture. Rien n'est encore jouable.

### Comment tester

1. **Installer** : `npm install` (ou `npm ci`, installation exacte depuis `package-lock.json`). Node 22.12 ou plus.
2. **Lancer** : `npm run dev`, ouvrir l'URL affichée (`http://localhost:5173`). À la livraison de l'étape 1 : une scène de
   démo Three.js (pelouse, une capsule orange, un ballon ovale) sous un calque Svelte, sans erreur dans la console (F12). Aujourd'hui, la
   même commande ouvre le menu de lancement.
3. **Vérification complète** : `npm run check` = `npm run typecheck` (tsc sur `tsconfig.sim.json`, **sans lib DOM** : un
   `window` ou un `document` dans `src/sim` / `src/bots` ne compile pas ; puis svelte-check sans avertissement) + `npm test`
   (dont `tests/architecture.test.ts` : `src/sim` n'importe rien hors de `src/sim`, `src/bots` seulement `src/sim`, pas de
   `Math.random`, `Date`, `performance`, timers, `console`… ; le client n'importe la sim que par `'../sim'`) + `npm run build`
   (dossier `dist/` statique, `base: './'`).
4. **Build statique** : `npm run build` puis `npm run preview` : le jeu tourne depuis `dist/`, y compris servi sous un
   sous-chemin (GitHub Pages).
5. **Captures** (vérification visuelle sans écran, Chromium headless + SwiftShader) : avec `npm run dev` lancé,
   `node scripts/snap.cjs http://localhost:5173/ capture.png 3000` écrit une capture 1280×720 et affiche les messages de la
   console de la page (erreurs comprises). Playwright doit être installé à part (`npm i -g playwright` puis
   `npx playwright install chromium`) : il n'est pas dans `package.json`.
6. **Garde-fou à essayer** : ajouter `Math.random()` ou `import '../render/…'` dans un fichier de `src/sim` : `npm test` (test
   d'architecture) et/ou `npm run typecheck` échouent. Annuler ensuite.

### Ce qu'on doit voir

- `npm run check` passe entièrement ; le build ne produit que des fichiers statiques dans `dist/`.
- La page s'ouvre sans erreur de console.

### Constantes utiles

Aucune constante de feeling à régler à cette étape : `src/sim/constants.ts` pose les premières valeurs (tick à 30 Hz —
`TICK_RATE`, à ne pas changer sans revoir les tests —, durée du match, dimensions du terrain, vitesses, caméra, entrées
clavier / manette), réglées et documentées aux étapes suivantes. Convention du fichier : chaque constante est commentée en
français avec « ↑ = … » (effet si on augmente la valeur).

## Étape 2 — simulation : joueurs, mouvement, ballon et terrain

La simulation (`src/sim/`) existe, mais rien ne l'affiche encore : le rendu arrive à l'étape 3. Cette étape se teste
donc surtout par les tests automatiques, et un peu à la main depuis la console du navigateur.

### Comment tester

1. **Tests automatiques** :
   - `npm test` (ou `npx vitest run tests/sim`) lance les tests de déterminisme, de mouvement, de ballon, de terrain et de performance.
   - Un fichier seul : `npx vitest run tests/sim/movement.test.ts` (ou `ball`, `field`, `determinism`, `performance`).
   - En continu pendant un réglage : `npm run test:watch`. Les tests de mouvement relisent les constantes, donc ils
     restent valides quand on change une valeur. S'ils cassent, c'est qu'une règle du feeling n'est plus respectée
     (par exemple une glissade devenue plus lente que la course).
2. **À la main, dans le navigateur** :
   - Lancer `npm run dev` et ouvrir l'URL affichée. On voit encore la scène de démo de l'étape 1, c'est normal.
   - Ouvrir la console (F12) et coller :
     ```js
     const sim = await import('/src/sim/index.ts');
     const s = sim.createMatch({ teamSize: 5, seed: 1,
       roles: [['ailier','demi','pilier','ailier','demi'], ['demi','pilier','ailier','demi','ailier']] });
     const v = [];
     for (let t = 0; t < 60; t++) {
       sim.step(s, { 0: sim.makeInput({ moveY: 1, buttons: t === 30 ? sim.Buttons.DODGE : 0 }) });
       v.push(Math.hypot(s.players[0].vel.x, s.players[0].vel.z).toFixed(1));
     }
     console.log(v.join(' '), s.ball.pos, sim.hashState(s));
     ```
   - Ce script fait courir l'ailier (joueur 0), puis esquiver au tick 30. On lit sa vitesse tick par tick :
     8,8 m/s en course, 14,7 pendant le dash (esquive droit devant : × `DODGE_FORWARD_SPEED_MULT` depuis la passe
     finale ; 21 sur le côté ou en arrière), puis 8,8. Avec `moveX: 1` au lieu de `moveY: 1` (esquive latérale) : 21,
     puis 12,6 qui redescend doucement vers la vitesse de pas chassé.
   - Rejouer le même script donne le même `hashState` : c'est le déterminisme.
   - Pour simuler une manette, utiliser une entrée analogique : `makeInput({ moveX: 0.94, moveY: 0.34, buttons: sim.Buttons.SPRINT })`
     correspond à un stick poussé à fond à 70°. On doit obtenir environ 8,3 m/s : en pas chassé, le sprint ne s'applique pas.

### Ce qu'on doit ressentir / voir (vérifié par les tests)

- **Course** : vitesse de pointe atteinte en moins de 0,2 s, et arrêt aussi rapide. Ordre des rôles : pilier (7,2) < demi (8,0) < ailier (8,8 m/s).
  Le porteur va 8 % plus vite. Le sprint ne marche qu'en avançant (y compris en diagonale à 45°) et pas en visée.
- **Manette** : un stick peu incliné fait marcher lentement. La pleine vitesse arrive à 90 % d'inclinaison.
  Pour sprinter, il faut pousser le stick franchement (au moins 70 %) et vers l'avant (cône d'environ ±50°).
  Un appui « esquive puis saut » rapide (B puis A) n'est jamais perdu : le saut part pendant le dash (dash-saut).
- **Esquive** : dash d’environ 3,5 m en 0,16 s sur le côté ou en arrière (≈ 2,5 m droit devant : c'est une feinte
  latérale, passe finale). En sortie, l'élan porte : 12,6 m/s qui redescend à la vitesse de course en un quart de seconde
  environ, sans arrêt sec. Cooldown 1,4 s, ramené à 0,8 s pour le porteur ; un appui jusqu'à 0,12 s trop tôt part dès que
  l'esquive est prête (tampon, passe finale). Elle marche aussi en l'air : l'élan est gardé, mais ce qui dépasse la vitesse
  de sprint s'éteint en ≈ 0,25 s (`AIR_OVERSPEED_DECEL`) — hacher sa course en esquives et en sauts ne va plus plus vite
  que le sprint.
- **Glissade** : uniquement en courant au-dessus de 5,5 m/s, et pas pour le porteur (C = plongeon, étape 4).
  Elle donne un boost (×1,35) avec une hitbox basse, puis décélère. Elle va plus loin que la course sur sa durée.
  On peut sauter depuis une glissade en gardant l'élan.
- **Saut** : hauteur d'environ 1,3 m. Coyote time de 0,1 s et tampon de saut de 0,12 s. Double saut : ailier seulement.
- **Terrain** : on monte les petites marches sans ralentir. Un muret bas abordé de face (ou en biais jusqu'à environ 66°)
  est grimpé sans arrêt, en perdant 25 % d'élan. Un muret qu'on frôle en le longeant ne fait rien de spécial : on passe à côté.
  Aucune traversée de muret, même en esquive répétée. Murs invisibles sur les bords.
  Les deux camps sont symétriques, et le 3v3 utilise un terrain à 70 % (de la surface depuis la correction de l'étape 7 : × 0,84 en longueur et en largeur).
- **Ballon** : rebonds de plus en plus petits avec une déviation imprévisible, mais reproductible avec la même seed.
  Il roule, puis s'arrête. Il dévale les flancs des buttes, mais peut rester posé sur une rampe douce.
  En roulant au pied d'une rampe, il la monte sans faux rebond.

### Constantes utiles pour ajuster le feeling

| Constante | Effet | Valeur actuelle | Piste de réglage |
|---|---|---|---|
| `ROLES.<rôle>.runSpeed` | Vitesse de course de base du rôle (m/s) | pilier 7,2 · demi 8,0 · ailier 8,8 | Garder l'écart entre rôles ; tout monter de 5 à 10 % pour un jeu plus nerveux |
| `GROUND_ACCEL` | Accélération et changements de direction au sol (m/s²) | 75 | Descendre vers 50 pour plus d'inertie, monter vers 100 pour plus de réactivité |
| `GROUND_DECEL` | Freinage au sol quand on lâche la direction (m/s²) | 60 | Monter pour des arrêts plus secs |
| `GROUND_OVERSPEED_DECEL` | Vitesse à laquelle l'élan en trop (esquive, glissade, grimpe, fin de sprint) disparaît (m/s²) | 15 | Descendre (10) pour un élan plus long et glissant, monter (25) pour revenir vite à la vitesse de course |
| `AIR_ACCEL` | Contrôle en l'air (m/s²) | 20 | Monter pour corriger sa trajectoire plus facilement en l'air |
| `AIR_OVERSPEED_DECEL` (passe finale) | Extinction en l'air de la vitesse au-delà du sprint (esquive, glissade, plongeon aérien) (m/s²) | 8 | 0 = élan aérien sans limite (esquive + sauts ≈ 14 m/s pour tous) ; 15 pour un dash-saut à peine plus long qu'un saut |
| `SPRINT_SPEED_MULT` | Bonus de vitesse du sprint | 1,12 (1,22 jusqu'à l'étape 7) | Entre 1,1 et 1,2 ; au-delà, le porteur devient difficile à rattraper (beaucoup plus d'essais) |
| `SPRINT_MIN_FORWARD_COS` | Largeur du cône avant dans lequel le sprint s'applique (cos de l'angle) | 0,64 (≈ 50°) | Descendre vers 0,5 (60°) pour sprinter plus en biais ; ne pas passer au-dessus de 0,7, sinon la diagonale clavier ne sprinte plus |
| `SPRINT_MIN_TILT` | Inclinaison du stick nécessaire pour sprinter | 0,7 | Monter vers 0,85 si la manette sprinte par erreur |
| `MOVE_INPUT_FULL_SPEED` | Inclinaison du stick qui donne la pleine vitesse | 0,9 | Descendre vers 0,75 si les sticks usés n'atteignent pas le bord |
| `CARRIER_SPEED_MULT` | Bonus de vitesse du porteur | 1,08 | Priorité du feeling porteur : essayer 1,1 à 1,12 |
| `DODGE_SPEED` / `DODGE_DURATION_SEC` | Vitesse et durée du dash (distance ≈ produit) | 21 m/s / 0,16 s | Garder la distance vers 3 à 4 m ; un dash plus court et plus rapide paraît plus sec |
| `DODGE_EXIT_SPEED_KEEP` | Part de la vitesse du dash gardée à la sortie | 0,6 (12,6 m/s) | Baisser vers 0,5 si l'esquive donne trop de vitesse, monter vers 0,7 pour enchaîner plus fluidement |
| `DODGE_FORWARD_SPEED_MULT` (passe finale) | Vitesse d'une esquive droit devant (× `DODGE_SPEED`, diagonale : moitié de l'effet) | 0,7 | 1 = esquive avant aussi rapide que latérale (esquive en boucle + 21 % sur le sprint) ; 0,8 si l'esquive avant paraît molle |
| `DODGE_BUFFER_SEC` (passe finale) | Tampon d'esquive : appui trop tôt honoré dès que possible | 0,12 s | 0 pour revenir à « appui perdu » ; 0,2 si des esquives manquent encore à la manette |
| `DODGE_COOLDOWN_SEC` / `CARRIER_DODGE_COOLDOWN_SEC` | Cooldown de l'esquive (sans ballon / porteur) | 1,4 / 0,8 s | Le porteur doit garder le cooldown le plus court |
| `DODGE_JUMP_CANCEL_SEC` | Délai avant de pouvoir sauter pendant un dash (dash-saut) | 0,07 s | 0 = saut immédiat, ce qui annule presque le dash ; ne pas dépasser `DODGE_DURATION_SEC` |
| `JUMP_VELOCITY` / `PLAYER_GRAVITY` | Hauteur (v²/2g) et nervosité du saut | 8,2 m/s / 26 m/s² | Monter les deux ensemble pour un saut aussi haut mais plus court |
| `COYOTE_TIME_SEC` / `JUMP_BUFFER_SEC` | Tolérance de saut après le bord / avant l'atterrissage | 0,1 / 0,12 s | Monter si des sauts semblent « mangés » |
| `SLIDE_BOOST` / `SLIDE_MAX_SPEED` | Boost à l'entrée de la glissade et son plafond | 1,35 / 14 m/s | Garder la glissade plus rapide que la course en moyenne (un test le vérifie) |
| `SLIDE_DECEL` / `SLIDE_DURATION_SEC` | Freinage pendant la glissade et sa durée | 6 m/s² / 0,6 s | Une glissade plus longue doit freiner moins, sinon sa fin traîne |
| `CLIMB_HORIZONTAL_KEEP` | Élan gardé en grimpant un muret | 0,75 | Monter vers 0,85 à 0,9 si les murets cassent trop la course du porteur |
| `CLIMB_UP_SPEED` | Vitesse de montée sur un muret (m/s) | 7,5 | Monter vers 9 pour franchir plus sèchement |
| `CLIMB_MIN_APPROACH` | Angle d'approche nécessaire pour grimper (cos) | 0,4 (≈ 66°) | Monter si l'on grimpe des murets sans le vouloir, baisser si l'on reste bloqué le long |
| `MAX_STEP_HEIGHT` / `MAX_CLIMB_HEIGHT` | Hauteur montée sans ralentir / hauteur maximale grimpée | 0,35 / 1,3 m | À accorder avec les hauteurs du relief (`FIELD_FEATURES_HALF_5V5`) |
| `FIELD_FEATURES_HALF_5V5` | Disposition du relief (une moitié, l'autre en miroir) | 1 butte, 1 rampe, 3 murets | Garder le couloir central et les abords des en-buts libres (tests de terrain) |
| `BALL_RESTITUTION` / `BALL_RESTITUTION_JITTER` | Hauteur des rebonds et leur variation | 0,5 ± 0,3 | Monter le jitter pour des rebonds plus fous |
| `BALL_BOUNCE_DEVIATION_DEG` | Déviation latérale aléatoire à chaque rebond | 40° | Descendre vers 25° si le ballon libre devient trop injuste |
| `BALL_GROUND_FRICTION` | Freinage du ballon qui roule. Sert aussi de seuil : sur une pente plus douce, un ballon arrêté reste posé | 4 m/s² | Descendre vers 2,5 pour qu'il roule plus loin et redescende aussi des rampes |
| `BALL_MIN_BOUNCE_SPEED` | Vitesse d'impact sous laquelle le ballon roule au lieu de rebondir | 1,2 m/s | Monter pour que le ballon se calme plus vite |

## Étape 3 — rendu minimal, caméra épaule, interpolation, clavier/souris et manette

On voit enfin le match : terrain, capsules, ballon, caméra épaule. Les bots n'existent pas encore (étape 6) : les
autres joueurs restent immobiles (on peut les pousser, parfois loin). Le ballon tombe au centre au démarrage.
La partie démarre en mode entraînement (chrono figé) : 3v3, tu joues l'ailier (joueur 0, orange).

### Comment tester

1. **Tests automatiques** : `npm test`, ou seulement le client : `npx vitest run tests/input tests/render tests/game`
   (verrouillage des appuis, Shift appui/maintien, assemblage de l'entrée, zones mortes intérieure et extérieure,
   courbe, boost, mapping manette, bascule L3, choix de la manette, débranchement, aide à la visée, vibrations, maths de
   la caméra, interpolation, postures, boucle à pas fixe). Vérification complète : `npm run check`.
2. **Clavier/souris** : `npm run dev`, ouvrir l'URL, **cliquer** pour capturer la souris (Échap la relâche et met en
   pause). Sur AZERTY : Z Q S D (ou les flèches) pour se déplacer, la souris pour regarder, Espace pour sauter (double
   saut : tu joues l'ailier), Maj **tapé** = esquive, Maj **maintenu** = sprint, C en courant = glissade, clic droit = visée.
3. **Manette** (Xbox ou PlayStation, branchée avant ou pendant la partie, Chrome ou Edge) : appuyer sur A / ✕ ou
   Menu / Options pour jouer, sans capturer la souris (depuis l'étape 8 : Start dans le menu de lancement). Stick gauche : déplacement. Stick droit : caméra. A : saut.
   B : esquive. X : glissade. L3 : sprint (bascule). LT : visée. Start : pause.
   À essayer :
   - débrancher la manette en jeu : la partie se met en pause et l'overlay repasse au clavier ;
   - poser la manette et jouer au clavier : une légère dérive du stick ne fait pas basculer l'overlay sur la manette ;
   - avec deux manettes, utiliser la seconde : c'est elle qui est lue.
   La manette vibre lors d'un atterrissage brutal. Les autres vibrations arriveront avec les plaquages et les essais.
4. **Mode debug** : ajouter `?debug` à l'URL (ex. `http://localhost:5173/?debug`). Pas d'overlay ni de pause, le clavier
   marche sans capturer la souris, et la session est exposée dans la console (`__ovalgun.session.state`).
   Depuis l'étape 4, **G** donne le ballon au joueur (et **B** le remet au centre) : voir ci-dessous.

### Ce qu'on doit voir / ressentir

- **Caméra épaule** : la caméra est derrière l'épaule droite, avec un vrai vide entre la tête et le réticule. Un tir
  partira exactement vers le réticule (c'est la même droite que dans la sim). Elle se rapproche en visée.
  Quand on porte le ballon, elle recule, même si l'on tient la visée : le porteur ne vise pas, sa caméra et ses
  sensibilités ne changent pas et son sprint L3 continue. Le champ de vision s'élargit un peu au sprint et pendant
  l'esquive, plafonné à +6° (pas de « coup de zoom » à chaque esquive).
- **Fluidité** : le mouvement reste fluide au-delà de 30 Hz d'affichage (position et rotation du ballon interpolées).
  La visée réagit à chaque image. Pause et reprise ne font pas reculer l'image.
- **Clavier** : un appui très bref (saut, esquive) n'est jamais perdu. Maj tapé = esquive au relâchement. Maj
  maintenu = sprint seul : l'esquive reste disponible pour le défenseur qui arrive. (Passe finale : le PORTEUR sprinte
  automatiquement et Maj l'esquive dès l'appui, `CARRIER_AUTO_SPRINT`.)
- **Manette** : le stick droit est précis au centre et rapide en bout de course. Maintenu à fond à l'horizontale, la
  rotation accélère après 0,2 s ; regarder en l'air à fond ne prépare pas de demi-tour brutal. Un stick usé atteint
  quand même la vitesse max. En visée, la caméra ralentit. Près d'un adversaire, elle « colle » légèrement (aide à la
  visée) mais ne bouge jamais seule.
- **Lisibilité** :
  - le ballon libre a un cercle jaune au sol (rayon de ramassage) et une traînée ;
  - un porteur a un losange jaune au-dessus de la tête, visible à travers les murets ;
  - en glissade ou en plongeon, le joueur se ramasse à la hauteur de sa hitbox (une capsule basse), au lieu de se coucher de tout son long.
- **Relief** : les reliefs affichés sont ceux de la sim. Limite connue : au bord d'une rampe ou d'un muret, un joueur
  peut rester « perché » jusqu'à 0,45 m au-delà de la face (appui en disque, voir ARCHITECTURE §8).

### Constantes utiles pour ajuster le feeling

| Constante | Effet | Valeur actuelle | Piste de réglage |
|---|---|---|---|
| `SHOULDER_OFFSET` | Décalage de l'épaule (et du départ des tirs) vers la droite | 0,75 m | Garder au moins 0,25 m de plus que `PLAYER_RADIUS` (un test le vérifie) ; 0,8 pour dégager encore le centre en visée |
| `AIM_ORIGIN_HEIGHT` | Hauteur du réticule (et du départ des tirs) au-dessus des pieds | 1,6 m | 1,7 pour faire passer le réticule au ras du haut de la tête |
| `CAMERA_DISTANCE` / `_CARRY` / `_AIM` | Recul de la caméra : course / porteur / visée (m) | 4,2 / 5,4 / 2,8 | Porteur plus loin (6) pour mieux lire le jeu ; visée plus près (2,4) pour plus de précision |
| `CAMERA_FOV` / `_CARRY` / `_AIM` | Champ de vision (degrés) | 72 / 78 / 58 | Monter pour plus de sensation de vitesse, au prix de la lisibilité au loin |
| `CAMERA_FOV_SPEED_GAIN` / `CAMERA_FOV_SPEED_MAX_BONUS` | FOV ajouté par m/s au-delà de la course, et son plafond | 3 °/(m/s) / 6° (gain 1,2 avant la passe finale) | 8 de plafond pour un effet « warp » ; gain à 0 pour le couper |
| `CAMERA_BLEND_RATE` | Vivacité des transitions de caméra (1/s) | 10 | Monter (15) pour des transitions plus sèches |
| `CAMERA_GROUND_MARGIN` / `CAMERA_MIN_DISTANCE` | Collision caméra / sol | 0,3 / 0,9 m | Monter la marge si la caméra frôle le sol en regardant en l'air |
| `MOUSE_SENSITIVITY` / `MOUSE_AIM_SENSITIVITY_MULT` | Sensibilité souris (rad/px), et multiplicateur en visée | 0,0022 / 0,6 | Réglage personnel : depuis l'étape 8, le panneau « Réglages » applique un multiplicateur (× 0,25 à × 3) sans toucher la constante |
| `SPRINT_HOLD_DELAY_SEC` | Maintien de Maj avant le sprint (et durée max d'un tape d'esquive) | 0,15 s | Baisser (0,12) si le sprint semble tarder, monter si des esquives partent en sprint |
| `KEYBOARD_DODGE_ON_RELEASE` | Esquive clavier au relâchement (sprint sans esquive) ou à l'enfoncement (latence nulle, mais chaque sprint commence par une esquive) ; ne concerne plus le porteur (`CARRIER_AUTO_SPRINT`, passe finale) | oui | Passer à `false` si l'esquive au clavier semble en retard |
| `GAMEPAD_MOVE_DEADZONE` / `GAMEPAD_LOOK_DEADZONE` | Zones mortes radiales intérieures | 0,15 / 0,12 | Monter si la manette dérive au repos |
| `GAMEPAD_MOVE_OUTER_DEADZONE` / `GAMEPAD_LOOK_OUTER_DEADZONE` | Zones mortes extérieures (« à fond » atteint avant le bord) | 0,05 / 0,08 | Monter (0,12) pour les sticks très usés |
| `GAMEPAD_ACTIVITY_THRESHOLD` | Geste nécessaire pour que la manette prenne la main sur le clavier | 0,35 | Monter si une manette posée « vole » encore la main |
| `GAMEPAD_LOOK_CURVE` | Courbe du stick droit | 1,8 | 1 = linéaire ; 2,2 pour plus de précision au centre |
| `GAMEPAD_LOOK_YAW_SPEED_DEG` / `_PITCH_SPEED_DEG` | Vitesse de caméra à fond (°/s) | 230 / 150 | Réglage principal du confort manette |
| `GAMEPAD_LOOK_BOOST_*` | Accélération en bout de course : seuil, horizontalité min., délai, montée, multiplicateur | 0,95 / 0,7 / 0,2 s / 0,35 s / ×1,6 | Baisser le délai pour des demi-tours plus rapides ; seuil 0,9 si le boost se déclenche mal |
| `GAMEPAD_AIM_LOOK_MULT` | Ralentissement de la caméra en visée | 0,55 | Baisser pour plus de précision en visée |
| `GAMEPAD_TRIGGER_THRESHOLD` | Enfoncement des gâchettes | 0,35 | Baisser pour un tir plus réactif |
| `GAMEPAD_INVERT_Y` | Axe vertical inversé | non | Préférence personnelle |
| `AIM_ASSIST_ENABLED` / `_ANGLE_DEG` / `_SLOWDOWN` / `_TRACKING` / `_MAX_TRACK_DEG_PER_SEC` | Aide à la visée manette | oui / 4° / 0,55 / 0,3 / 25 °/s | Plus d'aide : angle 5, ralentissement 0,45 ; ne pas dépasser 0,5 de suivi |
| `GAMEPAD_RUMBLE` / `GAMEPAD_RUMBLE_EFFECTS` / `RUMBLE_HARD_LANDING_SPEED` | Vibrations, leur table (durée, moteurs, priorité), seuil d'atterrissage brutal | oui / — / 9 m/s | Mettre `strong` et `weak` à 0 pour couper un signal |
| `BALL_CARRY_SIDE` / `_FORWARD` / `_HEIGHT` | Position du ballon porté | 0,5 / 0,35 / 1,05 m | Garder `BALL_CARRY_SIDE` > `PLAYER_RADIUS` pour que le ballon reste visible |

Réglages purement visuels (couleurs, contours, traînée, taille d'affichage du ballon, inclinaison des postures basses,
brouillard, tribunes) : `src/render/palette.ts`.

## Étape 4 — porteur : passe arrière assistée, coup de pied, plongeon, ramassage

On peut enfin jouer avec le ballon. Toujours en entraînement 3v3, ailier, sans bots (les autres joueurs restent
immobiles : ce sont des plots, coéquipiers orange et adversaires bleus).

### Comment tester

1. **Tests automatiques** : `npm test`, ou seulement le porteur : `npx vitest run tests/sim/carrier.test.ts`
   (ramassage, réception balayée sans « tunnel », visée assistée pour les deux équipes avec hystérésis et démarquage, passe
   qui arrive dans les mains d'un receveur qui court en 3v3 et 5v5, passe jamais en avant, coéquipier collé qui ne vole pas
   la passe, receveur qui esquive au départ, interception, coup de pied et contre, portée adaptée au 3v3, plongeon et
   muret, dernière minute, outils de test). Le test de déterminisme fait passer, attraper, taper et plonger des porteurs.
   Côté client : `npx vitest run tests/input tests/render tests/game`. Tout le projet : `npm run check`.
2. **Lancer** : `npm run dev`, ouvrir l'URL affichée (ajouter `?debug` pour jouer sans pointer lock et avoir les lignes de
   debug : vitesse, mode de mouvement, cible de passe, cooldowns).
3. **Outils de test** (en `?debug` et en entraînement, donc dans la partie actuelle) :
   - **G** (clavier) ou **View / Share** (manette) : le ballon pour toi, tout de suite ;
   - **B** (clavier) ou **croix ↓** (manette) : le ballon au centre, lâché de 3 m. Va le ramasser en courant dedans
     (cercle jaune), au clavier comme au stick.
4. **Actions du porteur** :
   - **Clavier** : **E** passe, **F** coup de pied, **C** plongeon (quand tu portes le ballon ; sinon C reste la glissade).
     La caméra (souris) choisit le côté de la passe et la hauteur du coup de pied.
   - **Manette** : **RB / R1** passe, **Y / △** coup de pied, **X / □** plongeon ; le stick droit choisit le côté de la
     passe et la hauteur du coup de pied.
5. **Scénario conseillé** (à faire une fois au clavier, une fois à la manette) :
   - G / View, avance de quelques mètres pour laisser tes deux coéquipiers derrière toi, puis tourne légèrement la caméra
     à gauche et à droite : la cible change de côté, sans clignoter au moindre mouvement. Passe (E / RB). Recommence en
     courant : en course, la passe peut partir « à plat ».
   - **Interception** : place-toi pour qu'un plot bleu soit entre toi et ton coéquipier (derrière toi), sur la ligne de
     passe. Un plot bleu collé sur ton flanc, à l'opposé de la passe, ne l'intercepte pas.
   - **Refus** : porte le ballon derrière tes coéquipiers et passe : « Aucun coéquipier derrière ».
   - **Coup de pied** : F / Y en regardant devant, puis un peu vers le haut (le point de chute recule et monte en cloche).
     Colle-toi à un plot bleu (moins de 1,5 m) et tape : il contre. À 3 m, il ne contre plus.
   - **Plongeon** : en courant, C / X. Essaie aussi contre un muret : tu le franchis, puis tu restes au sol.
   - **Ramassage** : B / croix ↓, puis cours dans le cercle jaune.
6. Pour simuler la dernière minute dans la console (`?debug`) : `__ovalgun.session.state.lastMinute = true`.

### Ce qu'on doit voir / ressentir

- **Ramassage** : le premier qui entre dans le cercle jaune prend le ballon (anneau jaune au sol, vibration courte). On
  peut sauter pour attraper un rebond haut. Un joueur au sol ne ramasse rien.
- **Indicateur de passe** (seulement quand tu portes le ballon ET que la passe est possible) :
  - un **éventail** au sol derrière toi = le cône de passe. Il est fixé au terrain : il montre toujours ton propre en-but,
    même si tu te retournes. **Vert** = une passe partirait, **rouge** = aucun coéquipier valide ;
  - un **chevron vert** au sol, au bord de l'éventail, pointe vers le coéquipier qui recevrait la passe. Ton receveur est
    presque toujours derrière toi, donc hors de l'écran : c'est le chevron qui le montre ;
  - une **flèche verte** tourne au-dessus de sa tête, visible à travers les murets, quand il est dans le champ ;
  - un trait fin part de toi vers lui, et un repère montre la direction de ton regard « replié » vers l'arrière ;
  - tout disparaît pendant le plongeon et le temps passé au sol après : la passe ne partirait pas.
- **Choix du receveur** : regarder un peu à gauche = passe à gauche. Il n'est pas nécessaire de tourner beaucoup la
  caméra. La cible est « collante » : il faut un vrai coup d'œil pour en changer, pas un pixel de souris. Si le regard ne
  départage pas, la visée préfère le coéquipier à environ 9 m et évite ceux marqués par un adversaire (un plaqueur collé
  à toi ne compte pas : il est derrière la passe). Un coéquipier devant toi n'est jamais choisi. Une passe à plat est permise.
- **Passe** : en cloche, elle part de ta poitrine et arrive dans les mains du receveur s'il garde sa course (le ballon vise
  là où il sera ; une esquive au moment de la passe ne l'envoie plus 20 m trop loin). Le receveur visé a un rayon de
  réception large (1,6 m) ; s'il s'arrête net ou coupe à angle droit au départ d'une passe courte, il la manque encore
  (limite connue). Le ballon **n'avance jamais** plus vite que toi : arrêté, une passe à un coéquipier qui sprinte devant ta
  ligne part à plat et il la manque. Seuls le receveur visé et les adversaires peuvent l'attraper : un coéquipier collé à
  toi ne la vole pas. Un adversaire sur la trajectoire (à moins de 0,8 m) l'intercepte : « Interception ! » (vibration plus
  marquée) pour celui qui attrape, « Ballon intercepté » pour le passeur. Tu ne peux pas rattraper ta propre passe.
- **Coup de pied** : une chandelle (48°) qui part loin devant : environ 37 m sans courir en 5v5, 31 m en 3v3 (26 m avec
  le terrain 3v3 d'avant la correction de l'étape 7 ; un peu plus en courant). Regarder plus haut donne plus de cloche. Un anneau et une fine balise blanche montrent le point de chute
  prévu pendant que tu portes. Au départ, seul un adversaire collé à toi (moins de 1,5 m) peut le **contrer** ; ensuite,
  personne ne porte le ballon en vol : coéquipiers et adversaires peuvent l'attraper (réceptionné par l'adversaire, ce
  n'est pas une « interception » : pas de vibration ni de texte). Toi, tu ne peux pas pendant 0,7 s, puis tu peux le
  rattraper (« chip and chase »). Après le premier rebond, il redevient libre (cercle jaune).
- **Plongeon** : un dash bas d'environ 6 m dans le sens du regard, ou en diagonale si tu pousses vers l'avant-côté. Le
  joueur s'aplatit et une coque blanche clignote (passe finale : halo à la couleur claire de l'équipe, pulsation lente) :
  il est intouchable pendant 0,3 s. Ensuite, il glisse au sol en freinant
  pendant 0,35 s et repart en course à ~4 m/s. Sur une seconde, ça couvre à peu près la distance d'un sprint : c'est un
  outil pour aplatir ou passer un défenseur, pas une accélération gratuite. Cooldown 2 s. On peut plonger depuis un saut
  (« essai en vol ») : l'élan est gardé jusqu'au sol, freiné au-delà de la vitesse de sprint (`AIR_OVERSPEED_DECEL`, passe
  finale : avant, 14 m en 1 s contre 9,7 au sol). Plonger contre un muret le fait franchir, puis on reste au sol quand
  même. On garde le ballon. L'essai dans l'en-but arrive à l'étape 6.
- **Recevoir en glissant** : la glissade continue avec le ballon, et on peut enchaîner directement un plongeon.
- **Effets** : anneaux flat pour le ramassage (jaune), la réception (blanc), l'interception (rouge), le coup de pied
  (onde au sol), le plongeon (cyan), la passe et la passe refusée.

### Constantes utiles pour ajuster le feeling

| Constante | Effet | Valeur actuelle | Piste de réglage |
|---|---|---|---|
| `PASS_SPEED` | Vitesse horizontale moyenne de la passe (m/s) | 17 | 19 à 20 pour des passes plus tendues, plus dures à intercepter |
| `PASS_MIN_FLIGHT_SEC` / `PASS_MAX_FLIGHT_SEC` | Durée de vol minimale (cloche des passes courtes) et maximale | 0,35 / 1,1 s | Monter le minimum (0,45) pour des passes courtes plus lobées |
| `PASS_TARGET_HEIGHT` | Hauteur de réception visée au-dessus du sol | 1,2 m | Garder entre 1 et 1,5 (dans les mains) |
| `PASS_LEAD` | Anticipation de la course du receveur | 1 | 0,8 si les receveurs changent souvent de direction (mais les passes longues en ligne droite arrivent alors derrière eux) |
| `PASS_LEAD_MAX_SPEED` | Vitesse du receveur prise en compte au plus par l'anticipation | 11 m/s | Monter si une capacité de sprint (étape 7) dépasse cette vitesse |
| `PASS_TARGET_CATCH_RADIUS` | Rayon de réception du receveur visé | 1,6 m | 2 pour des passes très pardonnantes ; 1,2 pour exiger une course propre |
| `PASS_INTERCEPT_RADIUS` | Rayon d'interception d'un adversaire sur la trajectoire | 0,8 m | 1 à 1,1 pour des interceptions plus fréquentes ; garder > `PLAYER_RADIUS` (0,45) |
| `PASS_MAX_RANGE` / `PASS_IDEAL_RANGE` | Portée de la visée assistée et distance préférée | 24 / 9 m | Baisser la distance idéale (7) pour des passes plus courtes et sûres |
| `PASS_AIM_LATERAL_GAIN` | Sensibilité du choix gauche / droite au regard | 2,5 | 3 à 4 si l'on doit trop tourner la caméra ; 1,5 si la cible saute trop |
| `PASS_TARGET_STICKY_BONUS` | Bonus de la cible actuelle (hystérésis) | 0,15 | 0,25 si la cible clignote encore ; 0,05 si elle est trop dure à changer |
| `PASS_WEIGHT_AIM` / `_DISTANCE` / `_OPENNESS` | Poids du regard, de la distance et du démarquage | 1 / 0,6 / 0,8 | Monter le regard pour plus de contrôle, le démarquage pour plus d'assistance |
| `PASS_OPENNESS_RADIUS` | Distance d'un adversaire qui rend une passe risquée | 4 m | Monter (5 à 6) pour éviter davantage les passes dangereuses |
| `PASS_RELEASE_OFFSET` | Décalage du point de départ de la passe vers le receveur | 0,6 m | Garder au-dessus de `PLAYER_RADIUS` (0,45) |
| `PASS_PICKUP_BLOCK_SEC` | Le passeur ne peut pas reprendre le ballon pendant | 0,4 s | Rarement à toucher |
| `BALL_PICKUP_RADIUS` | Rayon du cercle de ramassage du ballon libre | 1,3 m | 1,5 pour moins de courses ratées après le ballon |
| `BALL_CATCH_RADIUS` | Rayon de réception d'un coup de pied en vol | 1,1 m | Monter pour des chandelles plus faciles à réceptionner |
| `BALL_CATCH_REACH_ABOVE` / `BALL_REACH_BELOW` | Portée au-dessus de la tête / sous les pieds | 0,6 / 0,5 m | Monter la première pour récompenser le saut |
| `KICK_SPEED` / `KICK_ELEVATION_DEG` | Puissance (× √ échelle du terrain) et angle du coup de pied (portée ≈ v²·sin 2θ / g) | 25 m/s / 48° | ~37 m en 5v5 et ~31 m en 3v3 à l'arrêt (26 m avant la correction de l'étape 7, terrain 3v3 à 0,7) ; baisser l'angle (40°) pour un coup de pied plus tendu, plus facile à contrer |
| `KICK_CHARGE_DOWN_SEC` / `KICK_CHARGE_DOWN_RADIUS` | Fenêtre et distance du contre au départ du coup de pied | 0,15 s / 1,5 m | Monter la distance (2) pour des contres plus fréquents |
| `KICK_PITCH_INFLUENCE` / `KICK_ELEVATION_MIN_DEG` / `_MAX_DEG` | Effet du regard vertical sur l'angle, et bornes | 0,5 / 15° / 65° | 0 pour un coup de pied toujours identique |
| `KICK_INHERIT_VELOCITY` | Part de ta vitesse ajoutée au ballon | 0,3 | 0 pour une portée indépendante de la course, 0,5 pour récompenser l'élan |
| `KICK_PICKUP_BLOCK_SEC` | Le tireur ne peut pas reprendre le ballon pendant | 0,7 s | Baisser pour faciliter le « chip and chase » |
| `DIVE_SPEED` / `DIVE_DURATION_SEC` | Vitesse et durée du dash du plongeon (distance ≈ produit) | 17 m/s / 0,35 s | Garder la distance entre 5 et 7 m |
| `DIVE_INVULN_SEC` | Invulnérabilité du plongeon | 0,3 s | Cahier des charges : 0,3 s |
| `DIVE_RECOVER_SEC` / `DIVE_RECOVER_DECEL` | Temps au sol après le plongeon et freinage | 0,35 s / 40 m/s² | 0,25 s pour un plongeon plus fluide ; 0,45 s pour le rendre plus risqué |
| `DIVE_COOLDOWN_SEC` | Cooldown du plongeon | 2 s | 1,5 s pour un porteur plus insaisissable |
| `DIVE_INPUT_MIN_FORWARD_COS` | Plonger en biais : entrée assez tournée vers l'avant | 0,3 (≈ 72°) | 0,6 pour plonger presque toujours droit devant |
| `DIVE_IN_AIR` | Plongeon possible en l'air (« essai en vol ») | oui | `false` si les plongeons aériens portent trop loin |
| `LAST_MINUTE_BALL_SPEED_MULT` | Ballon plus rapide (passes, coups de pied) en dernière minute | 1,12 | — |
| `GAMEPAD_RUMBLE_EFFECTS.catch` / `.interceptionMade` / `.interceptionSuffered` | Vibrations de réception et d'interception | — | Mettre `strong` et `weak` à 0 pour couper |

Réglages purement visuels (indicateur de passe, chevron, point de chute, coque d'invulnérabilité, effets) :
`src/render/palette.ts` (`PALETTE`, `STYLE`, `FX`).

## Étape 5 — stabilité, plaquage et tir de l'ailier

On peut enfin tirer et plaquer. Toujours en entraînement 3v3, tu joues l'ailier (pistolet-mitrailleur). Les adversaires
sont des **tourelles d'entraînement** : immobiles, elles se tournent vers l'ennemi actif le plus proche à portée, **anticipent**
sa course et tirent par rafales (les vrais bots arrivent à l'étape 6). Seuls l'ailier et le pilier d'en face tirent : le
lance-grenades du demi et les capacités du pilier et du demi arrivent à l'étape 7. Tes coéquipiers restent des plots.

### Comment tester

1. **Tests automatiques** : `npm test`, ou seulement le combat : `npx vitest run tests/sim/combat.test.ts tests/bots`
   (cadence exacte, chargeur et rechargement automatique / manuel, porteur, joueur au sol et glissade qui ne tirent pas,
   coup de pied à la manette sans rechargement parasite, tir prioritaire sur le sprint, dispersion reproductible dans le cône,
   balle rapide sans « tunnel », cible qui court en travers touchée en visant son centre AFFICHÉ, adversaire collé à l'épaule,
   pas de tir ami, posture basse qui évite un tir à hauteur de torse, muret et butte qui bloquent, portée, atténuation,
   multiplicateur porteur, régénération au tick près, plaquage, relevé et invulnérabilité, glissade du plaqué plafonnée, corps
   au sol qui ne grimpe pas les murets, ballon lâché à sa position exacte, sprint boosté, dernière minute, tourelle pure,
   déterministe et qui anticipe). Le test de déterminisme fait tirer des tourelles sur des porteurs jusqu'au plaquage.
   Côté client : `npx vitest run tests/render tests/game tests/input` (traceurs même à deux ticks par image, corps couché qui
   ne tourne pas, hitmarker, bascule L3 qui survit au tir). Tout le projet : `npm run check`.
2. **Lancer** : `npm run dev`, puis l'URL affichée (ajouter `?debug` pour jouer sans pointer lock). Ajouter `?dummies=off`
   (ou `?debug&dummies=off`) pour des cibles **passives** qui ne tirent pas : idéal pour régler le plaquage tranquillement.
3. **Contrôles** :
   - **Clavier / souris** : **clic gauche** tir (maintenu = automatique), **clic droit** visée (plus précis), **R** recharger,
     **A** (Q en QWERTY) capacité (sprint boosté), **Maj maintenu** sprint, **C** glissade, **G** ballon pour toi (`?debug`).
   - **Manette** : **RT / R2** tir, **LT / L2** visée, **Y / △** recharger (coup de pied si tu portes le ballon, sans
     recharger en plus), **LB / L1** capacité, **L3** sprint (bascule), **X / □** glissade, **View / Share** ballon pour toi.
     L'aide à la visée « colle » légèrement aux adversaires actifs (pas à ceux au sol).
4. **Scénario conseillé** (une fois au clavier, une fois à la manette) :
   - `?dummies=off`, vise un adversaire et maintiens le tir : traceurs qui partent de l'arme, étincelles, hitmarker blanc sur
     le réticule, la cible clignote et sa barre de stabilité descend au-dessus de sa tête. À 0 : « Plaquage ! », hitmarker
     rouge, éclat en étoile et onde au sol, la cible tombe face contre terre avec des étoiles qui tournent, puis se relève sur
     place 2,5 s plus tard (coque blanche : intouchable un court instant).
   - Cibles mobiles : les tourelles sont immobiles (les bots qui courent arrivent à l'étape 6) ; c'est le test automatique
     « cible qui court en travers à 6 m » qui vérifie qu'on touche en visant le centre affiché. À l'inverse, tu peux le
     ressentir en courant en travers devant une tourelle : elle te touche (elle anticipe), et ses traceurs arrivent sur toi.
   - Arrête de tirer sur une cible entamée : sa barre ne bouge pas pendant 2 s, puis remonte vite.
   - Vide un chargeur : rechargement automatique (barre dans le mini-HUD). Tire 5 balles puis R / Y : rechargement manuel.
   - Sprint et tir : maintiens Maj (clavier) ou clique L3 (manette) en avançant, puis tire : le sprint s'arrête tant que tu
     tires (le tir l'emporte), et **reprend tout seul** quand tu lâches la gâchette ou pendant un rechargement — à la manette
     aussi, sans recliquer L3. La visée (clic droit / LT) coupe toujours le sprint.
   - Glissade (C / X) : pas de tir pendant la glissade (chip munitions grisée), le tir reprend dès que tu te relèves.
   - Capacité (A / LB) : 3 s de vitesse boostée (anneau vert, chip verte dans le HUD), puis 9 s de cooldown qui ne démarre qu'à la
     fin du boost. Ça marche aussi en portant le ballon.
   - Sans `?dummies=off` : **G** / **View** (ballon pour toi) puis avance vers l'ailier ou le pilier adverses (les tourelles
     visent l'ennemi le plus proche ; le demi d'en face ne tire pas encore) : tu encaisses (flèche rouge autour du réticule
     vers le tireur, vignette rouge quand ta stabilité baisse, vibration légère à chaque balle) jusqu'au plaquage, même en
     courant en travers (elles anticipent) : « Plaqué ! Ballon lâché », ton corps glisse un peu (≈ 1 m), le ballon rebondit
     3 à 5 m devant toi et n'importe qui d'autre peut le ramasser tout de suite (pas toi). Même plaqué en pleine esquive
     (Maj / B) ou en plongeon, le ballon ne part pas à 30 m.
   - Au sol, bouge la souris / le stick droit : ton corps couché ne tourne pas sur lui-même.
   - Zigzag et esquives face à une tourelle : on tient nettement plus longtemps qu'en ligne droite.
   - Plongeon du porteur (C / X) face à une rafale : invulnérable 0,3 s (coque blanche).
5. Pour simuler la dernière minute (`?debug`, console) : `__ovalgun.session.state.lastMinute = true` (rechargement et cooldown de
   capacité raccourcis de 30 % ; la cadence de tir ne change pas).

### Ce qu'on doit voir / ressentir

- **Tir** : 15 balles/s, très précis en visée (0,35°), un peu moins à la hanche (1,2°). Balles à 300 m/s : le traceur file de
  l'arme vers le réticule ; à courte et moyenne distance (≲ 15 m), viser la cible suffit, même si elle court. Portée 45 m,
  dégâts pleins jusqu'à 25 m puis ×0,6 à 45 m.
- **Hitbox honnête** : une balle dont le traceur passe sur la cible la touche (les projectiles sont testés contre les positions
  que tu voyais en tirant, avec une petite tolérance de 0,15 m).
- **Porteur** : il ne tire jamais (pas de traceur, pas de munition consommée) et encaisse ×1,1 (×1,3 depuis le réglage du
  rythme de la correction de l'étape 7, `CARRIER_DAMAGE_MULT`).
- **Au sol** : pas de tir, pas de déplacement, pas de ramassage ; les balles le traversent. Relevé sur place, jamais de respawn.
  Le corps glisse ≈ 1 m au plus et ne franchit pas les murets.
- **Plaquage lisible** : éclat jaune, onde blanche au sol, capsule couchée et étoiles, texte et vibration forte (manette).
- **Retours de visée** : hitmarker à chaque touche (rouge et plus gros au plaquage), indicateurs de direction des tirs reçus qui
  suivent le tireur quand tu tournes la caméra, vignette rouge sous 50 % de stabilité, flash rouge bref à chaque balle reçue.
- **Mini-HUD provisoire** (en bas) : jauge de stabilité (rouge et pulsante sous 35 %), munitions / rechargement, capacité
  (active / cooldown / prête), esquive. Remplacé par le vrai HUD à l'étape 8.

### Temps pour plaquer (mesuré, précision parfaite)

Ailier sur une cible immobile, toutes les balles touchent (en visée, la dispersion reste dans la capsule jusqu'à ~70 m).
Formule : n = ⌈100 / (dégâts × atténuation × porteur)⌉ balles, (n − 1) intervalles de 2 ticks, plus le vol de la dernière balle
(10 m par tick ; à 10 m, elle arrive dans le tick du tir). Vérifié au tick près par `tests/sim/combat.test.ts` (« temps pour plaquer »). Le premier tir part à t = 0.

| Distance | Cible | Dégâts / balle | Balles | Temps |
|---|---|---|---|---|
| 10 m | non-porteur | 5 | 20 | 38 ticks ≈ **1,27 s** |
| 10 m | porteur | 6,5 | 16 | 30 ticks ≈ **1,00 s** |
| 25 m | non-porteur | 5 | 20 | 40 ticks ≈ **1,33 s** |
| 25 m | porteur | 6,5 | 16 | 32 ticks ≈ **1,07 s** |
| 35 m | non-porteur | 4,1 | 25 | 51 ticks ≈ 1,70 s |
| 35 m | porteur | 5,3 | 19 | 39 ticks ≈ 1,30 s |

Lignes « porteur » avec `CARRIER_DAMAGE_MULT` = 1,3 (valeur actuelle). À l'étape 5 (× 1,1) : 1,20 s à 10 m, 1,27 s à 25 m,
1,57 s à 35 m.

Repères : un chargeur (30) suffit toujours ; la régénération remonte une jauge vide en 2,2 s après 2 s de répit ; à deux tireurs,
diviser à peu près les temps par deux. Un porteur qui zigzague et esquive fait rater des balles et tient bien plus longtemps.
Porteur ailier boosté au sprint : ≈ 11,7 m/s, contre 9,9 m/s pour un ailier qui le poursuit au sprint (13,9 contre 10,7 à
l'étape 5, avant le réglage du rythme : `SPRINT_SPEED_MULT` 1,22 -> 1,12, `BOOST_SPEED_MULT` 1,2 -> 1,1).

### Constantes utiles pour ajuster le feeling

| Constante | Effet | Valeur actuelle | Piste de réglage |
|---|---|---|---|
| `ROLES.ailier.weapon.damage` | Dégâts d'une balle | 5 | 6 => 17 balles pour plaquer (~1,1 s) ; 4 => 25 balles (~1,6 s) |
| `ROLES.ailier.weapon.fireInterval` | Intervalle entre deux balles, arrondi au tick | 2/30 s (15 coups/s) | 3/30 s = 10 coups/s, plus « lourd » |
| `ROLES.ailier.weapon.spreadHipDeg` / `spreadAimDeg` | Dispersion à la hanche / en visée (demi-angle) | 1,2° / 0,35° | Monter la hanche (2°) pour récompenser la visée |
| `ROLES.ailier.weapon.speed` | Vitesse des balles (m/s) | 300 | 200 pour des balles plus visibles et esquivables (plus d'avance à prendre) |
| `PROJECTILE_HIT_RADIUS` | Tolérance des balles autour des capsules (m) | 0,15 | 0,25 si l'on rate encore « sur » la cible ; 0 pour une précision stricte |
| `ROLES.ailier.weapon.range` / `falloffStart` / `falloffMinMult` | Portée, début de l'atténuation, dégâts restants à portée max | 45 m / 25 m / 0,6 | Baisser `falloffStart` (18) pour pousser au combat rapproché |
| `ROLES.ailier.weapon.magazine` / `reloadSec` | Chargeur et rechargement | 30 / 1,4 s | 24 balles pour forcer un rechargement par plaquage |
| `CARRIER_DAMAGE_MULT` | Dégâts subis par le porteur | 1,3 (1,1 jusqu'à l'étape 7) | 1,5 pour une défense plus forte ; 1,1 si le porteur tombe trop vite (plus d'essais) |
| `REGEN_DELAY_SEC` / `REGEN_RATE` | Répit avant régénération, vitesse de remontée (points/s) | 2 s / 45 | Cahier des charges : 2 s ; baisser le taux (30) pour que les dégâts « collent » plus |
| `DOWN_DURATION_SEC` / `GETUP_DURATION_SEC` / `GETUP_INVULN_SEC` | Au sol, relevé, invulnérabilité après relevé | 2,5 / 0,5 / 0,6 s | Cahier des charges : 2,5 s au sol ; monter l'invulnérabilité si l'on se fait replaquer en se relevant |
| `TACKLE_SLIDE_MAX_SPEED` / `TACKLE_SLIDE_DECEL` | Glissade du corps plaqué : vitesse max au plaquage, freinage | 7 m/s / 20 m/s² | Freinage 30 pour une chute plus sèche ; vitesse 9 pour une glissade plus spectaculaire |
| `TACKLE_DROP_POP_FORWARD` / `TACKLE_DROP_POP_UP` | Rebond du ballon lâché (avant / haut, m/s) | 2,5 / 4 | Monter l'avant (4) pour plus de « courses au ballon » |
| `TACKLE_DROP_CARRY_KEEP` / `TACKLE_DROP_MAX_CARRY` | Part de la vitesse du porteur transmise au ballon, plafond | 0,3 / 4 m/s | 0 : le ballon tombe toujours au même endroit ; plafond 6 pour des lâchers plus longs en sprint |
| `BOOST_SPEED_MULT` / `BOOST_ACCEL_MULT` | Sprint boosté de l'ailier : vitesse, accélération | 1,1 (1,2 jusqu'à l'étape 7) / 1,4 | 1,2 pour un boost plus grisant (porteur boosté presque intouchable) |
| `ROLES.ailier.ability.duration` / `cooldown` | Durée et cooldown du sprint boosté (le cooldown démarre à la fin) | 3 s / 9 s | 2 s / 8 s pour un boost plus « coup de rein » |
| `LAST_MINUTE_COOLDOWN_MULT` | Dernière minute : rechargement, capacité, esquive, glissade, plongeon (pas la cadence de tir) | 0,7 | — |
| `TURRET_LEAD_FRACTION` | Avance prise par les tourelles sur une cible qui court | 1 | 0,5 pour s'entraîner contre des tourelles qu'on esquive en courant |
| `TURRET_*` (autres) | Tourelles : portée, rotation, réaction, rafales, pauses, imprécision | 0,85 / 200°/s / 0,5 s / 0,5 s / 0,9 + 0,6 s / 1,6° + 0,5° | Monter l'erreur (3°) pour s'entraîner sous un feu moins précis |
| `GAMEPAD_RUMBLE_EFFECTS.hitTaken` / `.tackled` / `.tackleDealt` | Vibrations : tir reçu, plaquage subi, plaquage réussi | — | Mettre `strong` et `weak` à 0 pour couper |

`TACKLE_PICKUP_BLOCK_SEC` (0,5 s) n'est qu'une sécurité : il ne compte que si l'on raccourcit beaucoup la durée au sol.

Réglages purement visuels (traceurs, convergence vers le canon, flashs, étincelles, clignotement, barres de stabilité, chute,
étoiles, durées du hitmarker et des indicateurs, seuil de la vignette) : `src/render/palette.ts` (`PALETTE`, `STYLE`, `FX`).

## Étape 6 — boucle de match complète et bots

Un vrai match de 6 minutes : coup d'envoi, essais, remises en jeu, chrono, dernière minute, fin et « Rejouer ». Tous les joueurs non
humains (tes coéquipiers ET les adversaires) sont des bots qui lisent l'état du match et produisent une entrée comme toi (section BOTS
de `src/sim/constants.ts`). Clavier/souris et manette marchent partout, y compris sur l'écran de fin.

### Comment tester

1. **Tests automatiques** : `npm test`. Boucle de match : `tests/sim/rules.test.ts` (placement 3v3 / 5v5, décomptes au tick près — 3 s au
   premier coup d'envoi, 2 s aux remises en jeu —, essais en courant et en plongeon pour les deux équipes, **plaqué au tick où il franchit
   la ligne = essai**, plaqué avant = ballon lâché, ballon ramassé dans l'en-but, pause d'essai, remise à zéro, receveur désigné
   `kickoffReceivers`, entrée à −0, chrono, dernière minute, fin, entraînement, match complet scripté déterministe) et
   `tests/game/matchHud.test.ts` (HUD). Bots : `tests/bots` (pureté, déterminisme d'un match complet, matchs de 6 min en 3v3 et 5v5 sur trois
   seeds avec **bornes de rythme** — essais, part du ballon porté, joueurs au sol, coups de pied —, état et mémoires sans NaN / −0,
   comportements construits — passe sous pression, coup de pied encerclé, plongeon, esquive, pression, marquage, course au ballon, **joueur
   humain externe** —, difficulté : précision, réaction, écart de score entre niveaux).
2. **Match complet** : `npm run dev`, ouvrir l'URL (`?debug` pour jouer sans pointer lock). Clic (ou A à la manette) : décompte « 3, 2, 1 »
   (joueurs figés, on peut regarder autour), « JOUEZ ! ». **Tu reçois le ballon** au coup d'envoi (et à chaque remise en jeu de ton équipe).
   Cours (ZQSD / stick gauche, sprint Maj maintenu / L3), esquive (Maj tapé / B), passe en arrière (E / RB), coup de pied (F / Y), plongeon
   (C / X).
3. **Essai** : franchir la ligne adverse avec le ballon (ou plonger sur les derniers mètres). Bannière « ESSAI ! », anneaux dorés,
   vibration ; 2 s plus tard, remise en jeu (« 2, 1 ») : l'équipe qui a encaissé reçoit sur sa ligne, l'autre se replace derrière la
   médiane, ta caméra est retournée face à l'en-but adverse.
4. **Dernière minute et fin** : en `?debug`, dans la console : `__ovalgun.session.state.clockTicks = 1900` (chrono rouge, bannière
   « DERNIÈRE MINUTE »), puis `= 30` (fin dans une seconde). Écran de fin : résultat, score, statistiques par joueur. **Rejouer** : bouton
   (souris), Entrée / Espace, ou A à la manette (après 1 s ; 1,5 s depuis la correction de l'étape 8, et Start = Rejouer). À la fin, ni Échap / Start ni une manette débranchée ne mettent en pause.
5. **Difficultés** : `?difficulty=facile|normal|difficile` (défaut normal) ; `&size=5` pour du 5v5 (depuis l'étape 8 : choix
   du menu ; les paramètres d'URL restent acceptés pour le debug).
6. **Observer** : `?debug&autopilot` — ton joueur est aussi un bot, la caméra le suit (match bots contre bots). Combiner avec `&size=5` et
   `&difficulty=…` pour comparer. `?dummies=off` : tous les autres joueurs passifs (réglage du plaquage, comme à l'étape 5) ; `?training` :
   entraînement (chrono figé, G / B pour le ballon).

### Ce qu'on doit voir / ressentir

- Le chrono ne bouge pas pendant les décomptes et les pauses d'essai ; rouge à 1:00. Un essai dans la dernière seconde compte. Plaqué
  pile en franchissant la ligne, l'essai est accordé (tu tombes après).
- Porteur bot : il avance en contournant les défenseurs, sprinte quand c'est libre, esquive quand on lui tire dessus ou au contact, passe
  en arrière quand il est pressé et qu'un soutien est libre, tape rarement (encerclé, sans passe, et seulement vers un point où son équipe
  arrive la première — jamais dans l'en-but), plonge pour marquer.
- Défense : un dernier défenseur reste toujours devant le porteur et lui tire dessus ; un ou deux défenseurs convergent ; les autres
  collent les receveurs côté en-but. Juste après une remise en jeu, un seul défenseur monte : on a le temps de lancer le jeu.
- Ballon libre : deux joueurs de chaque équipe sprintent au ballon sans tirer (ils ne tirent que s'ils sont battus de vitesse) ; les
  autres gardent leur place. Le feu est surtout concentré sur le porteur : peu de joueurs au sol.
- Tes coéquipiers savent que tu es humain : si tu restes en retrait, un bot presse ou va au ballon à ta place.
- **Mesures** (bots contre bots, 6 min, seeds 1 à 4, normal ; avant -> après la correction de l'étape 6) : 3v3 ≈ 33 essais par match
  (26 avant), ballon porté 74 % du temps de jeu (41 %), 10 % de joueurs au sol (21 %), 27 % du temps réel figé (31 %), ≈ 3 coups de pied
  (43), 64 % des plaquages sur le porteur (13 %), précision 58 % (73 %). 5v5 ≈ 16,5 essais (18), porté 56 % (34 %), au sol 12 % (25 %), figé
  16 % (24 %), ≈ 4 coups de pied (27). Précision facile / normal / difficile ≈ 45 / 57 / 65 %. Entre niveaux voisins, le plus faible marque
  ≈ 15–40 % des points du plus fort (à l'étape 6 ; mesure actuelle, plus resserrée : docs/ARCHITECTURE.md §12). En 3v3 le
  rythme reste très arcade tant que le demi n'a pas d'arme (étape 7).

### Constantes utiles pour ajuster le feeling

| Constante | Effet | Valeur actuelle | Piste de réglage |
|---|---|---|---|
| `MATCH_DURATION_SEC` | Durée d'un match | 360 s | 180 pour des parties de test rapides |
| `FIRST_KICKOFF_FREEZE_SEC` / `KICKOFF_FREEZE_SEC` | Décompte du premier coup d'envoi / des remises en jeu (figés) | 3 s / 2 s | 1,5 s aux remises en jeu pour relancer encore plus vite |
| `TRY_PAUSE_SEC` | Pause de célébration après un essai (figés) | 2 s | 3 s si l'essai ne « respire » pas assez |
| `KICKOFF_RECEIVE_OFFSET` / `KICKOFF_DEFEND_OFFSET` | Lignes de la remise en jeu (×échelle) : devant sa ligne / derrière la médiane | 4 m / 6 m | Défense à 8 m pour plus d'espace à la première course |
| `TRY_POINTS` / `FIRST_KICKOFF_TEAM` | Points d'un essai / équipe du premier coup d'envoi | 5 / 0 (la tienne) | 1 pour commencer en défense |
| `LAST_MINUTE_SEC` / `LAST_MINUTE_COOLDOWN_MULT` / `LAST_MINUTE_BALL_SPEED_MULT` | Dernière minute | 60 s / 0,7 / 1,12 | Cooldowns 0,6 pour une fin plus frénétique |
| `BOT_DIFFICULTY.<niveau>.reactionSec` | Temps de réaction (possession, nouvelle cible, premier réflexe) | 0,5 / 0,32 / 0,22 s | Facile trop dur : 0,65 s |
| `BOT_DIFFICULTY.<niveau>.aimErrorDeg` / `.aimErrorM` | Erreur de visée (angle plancher / décalage latéral de près) | 5 / 3,5 / 2,5° ; 1 / 0,7 / 0,5 m | Le levier principal de la précision (cible : ≈ 35 / 50 / 65 %) |
| `BOT_DIFFICULTY.<niveau>.engageRangeMult` / `.burstPauseMult` | Portée de tir / pauses entre rafales | 0,75 / 0,85 / 0,95 ; × 1,3 / 1 / 0,9 | Pauses plus longues = moins de pression |
| `BOT_DIFFICULTY.<niveau>.dodgeReflex` / `.leadFraction` / `.turnRateDeg` | Esquive sous le feu / avance sur cible / rotation | 0,4 / 0,8 / 1,2 par s ; 40 / 80 / 100 % ; 300 / 420 / 600 °/s | Écart entre niveaux trop grand : rapprocher ces valeurs (elles se cumulent) |
| `BOT_COVER_MIN_DEFENDERS` / `BOT_COVER_DEPTH` | Dernier défenseur toujours gardé (dès N bots) / sa profondeur (×échelle) | 2 / 26 m (3 / 18 m jusqu'à l'étape 7) | Défense trop passive : MIN 3 |
| `BOT_PRESSERS_3V3` / `_5V5` / `BOT_PRESSERS_OWN_THIRD` | Défenseurs qui convergent / juste après une remise en jeu | 2 / 2 / 1 | 1 en 3v3 pour une défense moins étouffante |
| `BOT_ROLE_HYSTERESIS_M` / `BOT_LEAD_SPEED_CAP_MULT` | Stabilité des rôles / anticipation plafonnée (pas de suivi des esquives) | 1,5 m / 1,2 | Rôles qui « clignotent » : 2,5 m |
| `BOT_RESTRAINED_PAUSE_MULT` / `BOT_ESCORT_THREAT_DIST` | Discipline de tir hors pression / distance d'une menace directe | 2,5 / 8 m | Trop de joueurs au sol : 3,5 / 6 m |
| `BOT_MARK_SHOOT_CARRIER_DIST` | Un marqueur tire sur le porteur plus proche que ça | 14 m | Baisser pour laisser plus de champ au porteur |
| `BOT_BALL_CHASERS_3V3` / `_5V5` / `BOT_CHASE_SHOOT_MARGIN_SEC` | Chasseurs du ballon libre / ils ne tirent que battus de cette avance | 2 / 2 / 0,3 s | Fusillade au ballon : marge 0,6 s |
| `BOT_ENCIRCLED_RADIUS` / `BOT_ENCIRCLED_COUNT` / `_5V5` | Quand le porteur envisage de taper (sans passe) | 3,5 m / 2 / 3 | Plus de coups de pied : rayon 5 m |
| `BOT_KICK_MIN_ADVANTAGE_SEC` / `BOT_KICK_LAND_MIN_LINE_DIST` / `BOT_KICK_AFTER_KICK_SEC` | Coup de pied seulement si son équipe arrive avant / pas dans l'en-but / pas de ping-pong | 0,4 s / 8 m / 1,5 s | Plus de jeu au pied : avance 0 s |
| `BOT_PASS_MIN_OPENNESS` / `BOT_PASS_MIN_OPENNESS_OWN_THIRD` / `BOT_PRESSURE_RADIUS` | Démarquage exigé pour passer (normal / dans son tiers) / rayon de pression | 0,45 / 0,3 / 9 m (7 m jusqu'à l'étape 7) | Plus de passes : démarquage 0,3 |
| `BOT_SUPPORTERS_3V3` / `_5V5` | Soutiens derrière le porteur (les autres partent devant) | 2 / 3 (1 / 2 jusqu'à l'étape 7) | 1 / 2 pour plus de course devant (plus de contres, plus d'essais) |
| `BOT_DIVE_TRY_DISTANCE` | Distance de la ligne où le porteur plonge | 4,5 m | ≤ 6 m (longueur du plongeon) |
| `BOT_FIRE_CONE_DEG` / `BOT_BURST_SEC` / `BOT_BURST_PAUSE_SEC` | Rythme de tir | 3° / 0,7 s / 0,25 s | Pauses plus longues pour moins de pression |
| `GAMEPAD_RUMBLE_EFFECTS.try` / `.tryConceded` / `.matchEnd` | Vibrations : essai marqué / encaissé, fin | — | `strong` et `weak` à 0 pour couper |

Réglages purement visuels (durée de « JOUEZ ! », de la bannière de dernière minute, délai avant « Rejouer », anneaux de l'essai) :
`STYLE.playCallSec`, `STYLE.lastMinuteBannerSec`, `STYLE.endScreenInputDelaySec`, `FX.try` dans `src/render/palette.ts`.

## Étape 7 — rôles pilier et demi, mêlée

Les trois rôles sont jouables, pour toi comme pour les bots, et la mêlée existe. **Pilier** : fusil à pompe (gros dégâts de près) et
bouclier frontal ; **demi** : lance-grenades à impact qui repousse et zone de ralentissement au sol ; **ailier** : inchangé. En 3v3, un de
chaque rôle par équipe ; en 5v5, 1 pilier, 2 ailiers, 2 demis. **Mêlée** : un ballon libre depuis **3 s** avec au moins **2 joueurs de chaque
camp** autour (3 en 5v5), dans un rayon de **5 m** en 3v3 (6 m en 5v5), devient une **zone de capture** : le ballon est bloqué au centre
(personne ne peut le ramasser) et, après **3 s**, l'équipe qui a le plus de joueurs **debout** dans la zone récupère le ballon, porté par son
joueur le plus proche du centre. Les plaqués ne comptent pas : tirer sur les adversaires de la zone est la façon de la gagner. Égalité :
**prolongation de 2 s** en « premier qui mène », puis tirage au sort seedé ; personne dans la zone à la fin : ballon rendu libre au centre. Le
chrono continue. La correction de l'étape 7 a aussi **réglé le rythme** (≈ 13 essais par match en 3v3, ≈ 10 en 5v5, au lieu de ≈ 28 / 17 :
voir les mesures plus bas et docs/ARCHITECTURE.md §15).

### Comment tester

1. **Tests automatiques** : `npm test`. Étape 7 :
   - `npx vitest run tests/sim/roles.test.ts` : plombs par tir, dégâts à 3 / 8 / 15 m, plaquage en 2 tirs à bout portant ; bouclier qui bloque
     de face mais pas de dos, protège un coéquipier collé derrière, durée et cooldown exacts, annulation à cooldown proportionnel, vitesse
     réduite, pas de tir mais rechargement, porteur pilier, explosion de face ; parabole exacte, explosion sur muret / sol / joueur / bouclier
     / en l'air, dégâts dégressifs, impact direct, knockback dégressif et self-knockback, **souffle = vitesse minimale** (un coureur qui fonce
     sur l'explosion est renvoyé, un fuyard plus rapide ne gagne rien, deux souffles ne se cumulent pas), porteur projeté qui garde le ballon,
     pas de traversée de mur, pas de tir ami, butte qui protège ; zone posée à la visée et à portée max, ralentit les adversaires et pas les
     alliés, durée exacte, remplacement ;
   - `npx vitest run tests/sim/scrum.test.ts` : rien avant 3 s de ballon libre, déclenchement au tick exact, N joueurs de chaque côté (3v3 et
     5v5), rayon exact, plaqués exclus, pas de mêlée en phase figée, ballon immobile et non ramassable, résolution au tick exact, ballon au plus
     proche du centre puis au plus petit id, dernière minute sans effet, prolongation, tirage seedé, 0 contre 0, chrono, mêlée gagnée dans
     l'en-but adverse = essai, nettoyage, `inScrumZone` = décompte de la sim, déterminisme et aller-retour JSON en pleine mêlée ;
   - `npx vitest run tests/bots/roles.test.ts tests/bots/scrum.test.ts` : pilier qui lève le bouclier sous le feu de face et en portant le
     ballon, qui presse pour tirer de près ; demi qui lobe sur les pieds du porteur sans s'exploser, **pas de grenade quand un adversaire est
     collé sur la trajectoire**, zone posée devant le porteur ; contournement d'une zone adverse ; renforts qui entrent dans la zone de mêlée,
     majorité confortable, tirs dans la zone, zone tenue pendant l'approche, ballon ramassé en infériorité, **hystérésis de l'alerte de
     mêlée**, jeu normal après la résolution ; matchs complets (composition du jeu) où chaque rôle tire, plaque et utilise sa capacité, et où
     les mêlées se résolvent ;
   - `npx vitest run tests/bots/match.test.ts` : **bornes de rythme** resserrées (seeds 1 à 3, normal) : 4 à 18 essais par match en 3v3, 4 à
     14 en 5v5, ballon porté ≥ 50 % / 40 %, joueurs au sol ≤ 17 % / 19 %, au plus 10 coups de pied (resserrées encore à la passe
     finale : 4–16 / 4–12 essais, porté ≥ 55 % / 45 %) ;
   - client : vues (bouclier, grenades, explosions, zones, mêlée), HUD de la mêlée, vibrations, composition des équipes, aide à la visée.
2. **Choisir son rôle** (aujourd'hui dans le menu ; paramètre d'URL gardé pour le debug) : `?role=pilier`, `?role=ailier` (défaut) ou `?role=demi`, combinable avec
   `?debug`, `?size=5`, `?difficulty=…`, `?dummies=off` (cibles passives), `?training`. Exemples : `http://localhost:5173/?debug&role=pilier`,
   `…/?debug&role=demi&dummies=off`.
3. **Contrôles** (aucune nouvelle touche, clavier et manette identiques) : tir **clic gauche / RT**, visée **clic droit / LT**, capacité
   **A (Q en QWERTY) / LB** ; **second appui** sur la capacité = baisser le bouclier. Mêlée : déplacement et tir habituels (ZQSD / stick
   gauche, clic gauche / RT).
4. **Pilier** (`?debug&role=pilier&dummies=off`, B / croix ↓ pour lâcher le ballon au centre) :
   - colle-toi à un adversaire (3–5 m) et tire deux fois : **plaquage en 2 tirs** (0,83 s entre deux tirs, 5 cartouches, 2 s de rechargement).
     Recule à 10 m puis 15 m : les plombs se dispersent et ne font presque plus rien ;
   - capacité : un **arc translucide** à la couleur de ton équipe se déploie devant toi (3 s) ; tu ralentis (× 0,75), tu ne tires plus (mais tu
     peux recharger) ; à la manette, l'aide à la visée est coupée (la caméra n'« accroche » plus en tournant le bouclier vers la menace).
     Fais-toi tirer dessus de face : le bouclier **flashe** et les balles s'arrêtent dessus, manette : petite vibration sèche. De dos, tu prends
     tout. Il couvre un coéquipier **collé dans ton dos**, pas un coéquipier à quelques mètres sur le côté ;
   - appuie une deuxième fois : le bouclier se baisse, le cooldown est plus court si tu l'as peu utilisé (au moins 3 s) ;
   - porte le ballon (G / View) et lève le bouclier : tu charges plus lentement mais les défenseurs d'en face ne te plaquent plus de face.
5. **Demi** (`?debug&role=demi&dummies=off`) :
   - capacité prête : un **anneau en tirets** au sol montre où la zone sera posée (au point visé, ou à 16 m si tu vises l'horizon). A / LB :
     un **disque** à la couleur de ton équipe pendant 5 s ; les adversaires qui courent dedans vont à 55 % de leur vitesse, tes coéquipiers non ;
     cooldown 12 s dès la pose ;
   - tir : la grenade part en cloche et explose à l'impact. En **visée** (clic droit / LT), un anneau + une balise montrent où elle tombera
     (pas d'aide à la visée manette pour le tir en cloche). Une grenade sur un adversaire le **projette** (≈ 4,5 m de vol au centre) : un
     adversaire qui te fonce dessus est **renvoyé** vers l'arrière, un porteur qui s'enfuit plus vite que le souffle n'est pas accéléré ; un
     porteur projeté garde le ballon ;
   - « grenade jump » : saute et tire tout de suite à tes pieds : tu montes nettement plus haut, sans dégâts ;
   - une explosion derrière une butte ne touche pas ; une grenade sur un bouclier levé de face ne fait rien au pilier (il est juste un peu
     repoussé). Manette : vibration moyenne quand une explosion éclate près de toi.
6. **Mêlée** : `?debug`, puis **B** / croix ↓ (ballon au centre) quand les deux équipes sont autour du centre, et ne touche pas le ballon : il
   faut qu'il reste libre 3 s. Ou observe `?debug&autopilot` (≈ 1,4 mêlée par match en 3v3, ≈ 1,1 en 5v5 avec `&size=5` depuis la
   passe finale ; ≈ 2,5 / 1,2 avant, quand les receveurs laissaient tomber les passes). Pendant la
   mêlée : entre dans la zone (le HUD affiche « tu comptes »), tire sur les adversaires qui y sont (un plaqué sort du décompte), ou reste
   dehors pour te placer pour la suite.
7. **Observer les bots** : `?debug&autopilot&role=pilier` (ou `&role=demi`, `&size=5`, `&difficulty=…`).

### Ce qu'on doit voir / ressentir

- **Pilier** : le plus lent (7,2 m/s), redoutable de près, inutile de loin ; son bouclier en fait le meilleur « porteur de choc ». Il reste
  vulnérable de dos, aux lobs et pendant le cooldown ; le bouclier ne protège qu'un coéquipier collé derrière lui (pas un mur).
- **Demi** : peu de dégâts directs (2 à 3 grenades pour plaquer), mais il déplace les gens (un coureur qui fonce sur l'explosion repart en
  arrière, un défenseur est éjecté de sa ligne) et ralentit une zone clé : c'est un rôle de contrôle. Les demis bots ne s'explosent plus au
  visage en tirant sur un adversaire collé à eux.
- **Porteur** (réglage du rythme) : toujours le plus rapide (course × 1,08, sprint × 1,12), mais un défenseur qui sprinte peut le rattraper et
  il tombe plus vite sous le feu (dégâts × 1,3) : il faut passer, esquiver, jouer avec ses soutiens (deux en 3v3, trois en 5v5, placés derrière
  lui). Les essais « tout seul de 40 m » deviennent rares.
- **Mêlée** : grande onde au centre, « MÊLÉE ! », manette : double grondement moyen (pour tout le monde). Disque au sol de rayon exact
  (liseré blanc), bande extérieure en deux arcs aux couleurs des équipes (chaque arc grandit depuis le côté de son en-but), remplissage du
  centre vers la bande au fil de la capture (couleur de l'équipe qui mène), rideau bas visible de loin ; prolongation dorée qui pulse.
  HUD : « MÊLÉE » / « PROLONGATION · premier qui mène », décompte, jauge, temps restant, « tu comptes ». Résolution : fondu à la couleur du
  vainqueur, « Mêlée gagnée par … », vibration nette (gagnée) ou sourde (perdue).
- **Bots** : les piliers pressent pour tirer de près et lèvent le bouclier quand on leur tire dessus de loin ou quand ils portent le ballon face
  à un défenseur ; les demis gardent leurs distances (≈ 12 m), lobent sur les pieds du porteur et posent leur zone devant lui ; tout le monde
  contourne les zones adverses ; personne ne tire sur un bouclier qui lui fait face. Un défenseur reste toujours en repli devant le porteur
  (dès deux bots debout). Quand un ballon traîne au sol depuis 1,6 s au milieu des deux équipes, l'équipe qui n'est pas en infériorité
  l'entoure à 2,5 m en tirant sur celui qui s'en approche ; pendant la capture, chaque équipe envoie de quoi avoir une majorité confortable
  (adversaires + 2) et tire dans la zone, les autres se placent pour la suite.

### Mesures d'équilibrage

Harnais de relecture : matchs bots contre bots de 6 min, difficulté normale, composition du jeu par défaut (3v3 ailier, pilier, demi ; 5v5
ailier, pilier, ailier, demi, demi), seeds 1 à 24. « Avant » = étape 7 avant le réglage du rythme ; « après » = réglage actuel.

| Par match | 3v3 avant | 3v3 après | 5v5 avant | 5v5 après |
|---|---|---|---|---|
| **Essais** (min–max) | 27,5 (24–33) | **13,3** (9–18) | 16,6 (12–22) | **9,8** (6–15) |
| Possessions converties en essai | 41 % | 23 % | 25 % | 16 % |
| Possession médiane | 5,2 s | 5,8 s | 4,5 s | 4,9 s |
| Ballon porté / libre (part du jeu) | 66 % / 26 % | 59 % / 28 % | 52 % / 35 % | 47 % / 38 % |
| Joueurs au sol (part du temps-joueur) | 12,3 % | 13,9 % | 15,4 % | 16,2 % |
| Vitesse moyenne du porteur | 10,4 m/s | 9,6 m/s | 11,4 m/s | 10,3 m/s |
| Temps porté sans défenseur devant (20 m) | 38 % | 20 % | 27 % | 18 % |
| **Mêlées** (part du temps de jeu) | 1,8 | **2,5** (2,1 %) | 1,6 | **1,2** (1,0 %) |
| Plaquages (part ailier / pilier / demi) | 97 | 104 (37 / 34 / 29 %) | 196 | 201 (40 / 18 / 42 %) |
| Coups de pied | — | 2 | — | 1,5 |

- Essais par rôle (3v3, après) : ailier ≈ 6,6, demi ≈ 4,1, pilier ≈ 2,2. Facile / difficile (après, seeds 1–8) : 19,4 / 12,9 essais en 3v3,
  13,8 / 8,9 en 5v5. Composition « humain pilier » (`TEAM_ROLES_*` dans l'ordre) : 13,6 / 9,1. Le 3v3 reste en haut de la cible (≈ 4 à 12) :
  sans changer de règle, les autres leviers crédibles ne descendent pas sous 12–13.
- Mêlées (après) : ≈ 80 % décidées au bout des 3 s, le reste en prolongation, tirages très rares ; aucun biais d'équipe (217 / 220 mêlées
  gagnées en 3v3, 136 / 133 en 5v5 sur les séries de mesure). Par match 3v3 : ≈ 225 explosions, ≈ 75 tirs bloqués par un bouclier (bouclier
  levé ≈ 13 % du temps d'un pilier), une zone de ralentissement sur le terrain ≈ 60 % du temps (73 % en 5v5).

**Temps pour plaquer** (cible immobile, toutes les munitions vers le centre de la capsule — visée parfaite, médiane sur 5 seeds — puis bot
normal, médiane sur 8 seeds ; « porteur » : × `CARRIER_DAMAGE_MULT`, 1,1 avant le réglage, 1,3 après) :

| Arme, distance | Visée parfaite | Porteur avant -> après | Bot normal (porteur) |
|---|---|---|---|
| Fusil à pompe (pilier), 4 m | 0,87 s (2 tirs) | 0,87 -> 0,87 s | 2,5 s (1,7 s) |
| Fusil à pompe, 8 m | 1,77 s (3 tirs) | 0,93 -> 0,93 s | 4,9 s (3,7 s) |
| Fusil à pompe, 12 m | 3,5 s | 2,6 -> 2,6 s | hors portée bot (10 m) |
| Pistolet-mitrailleur (ailier), 4–8 m | 1,30 s | 1,23 -> 1,03 s | 2,8 s (2,5 s) |
| Pistolet-mitrailleur, 12–20 m | 1,33 s | 1,27 -> 1,07 s | 2,9 s à 12 m, 7,6 s à 20 m (2,5 / 7,2 s) |
| Lance-grenades (demi), 4 m | 1,9 s | 1,9 -> 1,0 s | ne tire pas (< 6 m) |
| Lance-grenades, 8–12 m | 2,0–2,8 s | 2,0–2,8 -> 1,1–1,3 s | 6,2 s à 12 m (4,0 s) |
| Lance-grenades, 20 m | 7,5 s | 7,5 -> 2,3 s | souvent > 8 s |

Le knockback des grenades éloigne la cible (le temps du demi augmente avec la distance et contre une cible qui bouge). Les temps « bot »
comprennent la réaction, les rafales et l'erreur de visée de la difficulté.

### Dégâts du fusil à pompe (mesuré, 40 tirs, cible immobile visée au centre)

| Distance | Hanche | Visée | Tirs pour plaquer (hanche) |
|---|---|---|---|
| 3–5 m | 52 (tous les plombs) | 52 | **2** |
| 8 m | ≈ 38 | ≈ 46 | 3 |
| 10 m | ≈ 22 | ≈ 35 | 5 |
| 15 m | ≈ 6 | ≈ 10 | > 10 (inefficace) |

### Constantes utiles pour ajuster le feeling

| Constante | Effet | Valeur actuelle | Piste de réglage |
|---|---|---|---|
| `ROLES.pilier.weapon.pellets` / `.damage` | Plombs par tir, dégâts par plomb (52 à bout portant = 2 tirs) | 8 / 6,5 | Garder `pellets × damage` ≥ 50 pour le plaquage en 2 tirs |
| `ROLES.pilier.weapon.spreadHipDeg` / `spreadAimDeg` / `falloffStart` / `range` | Dispersion, atténuation, portée | 6° / 4,5° / 6 m / 15 m | `range` 12 si le pilier gagne trop de duels à moyenne distance |
| `ROLES.pilier.weapon.fireInterval` / `magazine` / `reloadSec` | Cadence, cartouches, rechargement | 25/30 s / 5 / 2 s | 30/30 s pour un fusil plus lourd |
| `ROLES.pilier.ability.duration` / `cooldown` | Bouclier : durée, cooldown après la durée | 3 s / 10 s | 4 s / 12 s pour un bouclier plus « tank » |
| `SHIELD_HALF_ANGLE_DEG` / `SHIELD_DISTANCE` / `SHIELD_HEIGHT` | Arc protégé, rayon de l'arc, hauteur (sim et rendu) | 65° / 0,8 m / 2,1 m | `SHIELD_DISTANCE` 1,2 m pour couvrir plus largement les coéquipiers derrière (à remesurer) |
| `SHIELD_SPEED_MULT` / `SHIELD_CANCEL_MIN_COOLDOWN_FRACTION` / `SHIELD_BLAST_KNOCKBACK_MULT` | Vitesse bouclier levé, coût d'un bouclier baissé tôt, souffle encaissé | 0,75 / 0,3 / 0,35 | 0,65 si le porteur pilier bouclier levé est trop dur à arrêter |
| `ROLES.demi.weapon.speed` / `.gravity` | Vitesse et cloche des grenades (portée ≈ v²/g) | 30 m/s / 18 m/s² | 34 m/s pour des lobs plus tendus |
| `ROLES.demi.weapon.blastRadius` / `blastDamageCenter` / `blastDamageEdge` / `directHitBonus` | Explosion | 3,5 m / 32 / 10 / +10 | Centre 38 pour un demi plus « tueur » |
| `ROLES.demi.weapon.knockback` / `knockbackUp` / `knockbackEdgeMult` | Souffle au centre (vitesse MINIMALE imposée) et au bord | 10 / 6 m/s / 0,35 | 9 si le contrôle paraît trop fort ; 12 pour des projections spectaculaires |
| `ROLES.demi.weapon.selfKnockbackMult` / `KNOCKBACK_MAX_*` | « Grenade jump » / plafonds du souffle | 0,75 / 16 et 13 m/s | 1 pour des sauts plus hauts |
| `ROLES.demi.ability.duration` / `cooldown` / `SLOW_ZONE_RADIUS` / `SLOW_ZONE_SPEED_MULT` | Zone : durée, cooldown, taille, ralentissement | 5 s / 12 s / 4,5 m / 0,55 | 0,45 pour une vraie « boue » |
| `SPRINT_SPEED_MULT` / `BOOST_SPEED_MULT` | Sprint (tous), sprint boosté de l'ailier — premier levier du rythme | 1,12 / 1,1 | 1,15 / 1,15 pour un jeu plus rapide (≈ +1 essai) ; 1,22 / 1,2 (avant) : ≈ +3 essais en 3v3, +2 en 5v5, porteur à 10,4–11,1 m/s |
| `CARRIER_DAMAGE_MULT` | Dégâts subis par le porteur | 1,3 | 1,5 : même rythme en normal, mais moins de ballon porté et plus de joueurs au sol ; ≈ −3 essais contre les bots faciles (15,9 au lieu de 19,4 en 3v3) |
| `FIELD_SCALE_3V3` | Taille du terrain 3v3 (70 % de la surface) | 0,84 | 0,9 : ≈ −1,5 essai en 3v3 ; 0,7 : ≈ +3 essais |
| `BOT_SUPPORTERS_3V3` / `_5V5` / `BOT_COVER_MIN_DEFENDERS` / `BOT_COVER_DEPTH` / `BOT_COVER_LINE_FRACTION` / `BOT_PRESSURE_RADIUS` | Soutiens derrière le porteur, repli permanent, rayon de pression du porteur bot | 2 / 3 / 2 / 26 m / 0,9 / 9 m | Défense bot trop passive : `BOT_COVER_MIN_DEFENDERS` 3 |
| `TEAM_ROLES_3V3` / `TEAM_ROLES_5V5` | Compositions par défaut | 1 de chaque / 1 pilier + 2 ailiers + 2 demis | 2 piliers en 5v5 pour un jeu plus « avants » |
| `BOT_SHOTGUN_ENGAGE_DIST` / `BOT_GRENADE_ENGAGE_DIST` / `BOT_GRENADE_MIN_DIST` / `BOT_GRENADE_STANDOFF` | Portées des bots pilier / demi | 10 / 28 / 6 / 12 m | Demi trop fort : engagement 22 m |
| `BOT_GRENADE_SELF_MARGIN` / `BOT_GRENADE_PATH_MARGIN` | Demi bot : impact loin de lui, trajectoire libre d'adversaires sur ses premiers mètres | 1 m / 0,5 m | 0,8 m de marge de trajectoire si des demis s'explosent encore au contact |
| `BOT_SHIELD_RAISE_STABILITY_FRACTION` / `BOT_SHIELD_PANIC_STABILITY_FRACTION` / `BOT_SHIELD_CARRIER_DIST` / `BOT_SHIELD_CALM_SEC` | Quand les piliers bots lèvent / baissent le bouclier | 0,8 / 0,45 / 14 m / 0,6 s | Boucliers bots trop fréquents : 0,6 / 0,3 / 10 m |
| `BOT_ZONE_LEAD_SEC` / `BOT_ZONE_AHEAD` / `BOT_ZONE_MAX_DIST` / `BOT_ZONE_AVOID_MARGIN` / `BOT_CARRIER_ZONE_PENALTY` | Pose et contournement des zones par les bots | 0,6 s / 3 m / 14 m / 0,8 m / 0,6 | Pénalité 0 : les porteurs foncent dans les zones |
| `SCRUM_LOOSE_SEC` / `SCRUM_CAPTURE_SEC` / `SCRUM_TIE_EXTRA_SEC` | Mêlée : ballon libre avant déclenchement, capture, prolongation (cahier des charges : 3 s / 3 s) | 3 s / 3 s / 2 s | Prolongation 3 s si trop de tirages au sort |
| `SCRUM_RADIUS` / `SCRUM_MIN_PLAYERS_3V3` / `_5V5` | Rayon de la zone en 5v5 (× 0,84 en 3v3) / joueurs debout requis de chaque camp | 6 m / 2 / 3 | 7 m pour des mêlées plus fréquentes et plus ouvertes |
| `BOT_SCRUM_APPROACH_SEC` | Quand les bots se mettent à jouer la mêlée (ballon libre depuis…) | 1,6 s | 1,2 s : ≈ 4 mêlées par match en 3v3 mais bots qui tournent autour du ballon ; 2 s : ≈ 1,7 / 0,8 |
| `BOT_SCRUM_HOLD_MARGIN` / `BOT_SCRUM_HOLD_GRACE_SEC` / `BOT_SCRUM_LEAD_MARGIN` | Zone tenue sans ramasser, abandon si la mêlée ne vient pas, majorité confortable | 1,2 m / 0,3 s / 2 | `BOT_SCRUM_LEAD_MARGIN` 1 pour plus de soutien après la mêlée |
| `GAMEPAD_RUMBLE_EFFECTS.shieldBlock` / `.explosionNear` / `.scrumStart` / `.scrumWon` / `.scrumLost`, `RUMBLE_EXPLOSION_NEAR_MULT` | Vibrations de l'étape 7 | — / 1,5 | `strong` et `weak` à 0 pour couper |

Réglages purement visuels (bouclier, grenades, explosions, zones, aperçus du demi, zone de mêlée, bannières « MÊLÉE ! » et « Mêlée gagnée
par … ») : `src/render/palette.ts` (`PALETTE`, `STYLE`, `FX.scrumStart` / `scrumWon`).

## Étape 8 — HUD et menu

Le jeu s'ouvre sur un **menu de lancement** (un match bots contre bots tourne en fond, caméra de biais) : format 3v3 / 5v5, rôle
(cartes avec vitesse, portée, dégâts et capacité tirés de `ROLES`), difficulté des bots, mode entraînement, aperçu de l'équipe,
aperçu des contrôles clavier ET manette, JOUER. En jeu, un vrai **HUD** : score et chrono, jauge de stabilité, pastilles
d'actions, rôle, mini-flèche vers le ballon hors champ, flux d'événements, grandes annonces, messages personnels près du
réticule. **Pause** (Échap / Start) : reprendre, contrôles, réglages, recommencer, quitter. **Écran de fin** : résultat, joueur
du match, statistiques, Rejouer / Menu. Tout se pilote à la souris, au clavier et à la manette. La correction de l'étape 8 a
réglé l'aide à la visée après un passage par le menu, la navigation qui « défilait » toute seule dans la pause et plusieurs
détails d'ergonomie (voir docs/ARCHITECTURE.md §16, « Correction de l'étape 8 »).

### Comment tester

1. **Tests automatiques** : `npm test`. Étape 8 :
   - `tests/game/ballArrow.test.ts` : projection, bord de l'écran, ballon derrière, continuité sur le côté, zones du HUD évitées
     et **marge des zones** (le disque et la pointe ne recouvrent plus l'étiquette sous le score) ;
   - `tests/ui/focusNav.test.ts` (navigation spatiale, cartes surélevées, boucle verticale), `tests/ui/controlHints.test.ts`
     (glyphes clavier / Xbox / PlayStation, AZERTY / QWERTY, couverture de la keymap), `tests/ui/storage.test.ts`
     (localStorage absent / qui jette / corrompu) ;
   - `tests/game/settings.test.ts` (réglages, choix, URL, debug), `tests/game/eventFeed.test.ts`, `tests/game/roleCards.test.ts`
     (cartes, aperçu, **note de composition tirée de `TEAM_ROLES_*`**), `tests/game/matchHud.test.ts` (chrono au dixième,
     **joueur du match** : poids, égalité => le premier, tout à zéro => personne) ;
   - `tests/input/menuNav.test.ts` : fronts, répétition, stick, reset, **stick maintenu en jeu puis pause : aucune répétition
     avant relâchement** ; `tests/input/aimAssist.test.ts` : **candidats de l'aide à la visée recréés à chaque match** (5v5 ->
     3v3 -> 5v5) ;
   - `npm run typecheck` : svelte-check sans avertissement (accessibilité comprise).
2. **Menu** : `npm run dev`, ouvrir `http://localhost:5173/` (sans paramètre).
   - Souris : cliquer les choix. Clavier : flèches (navigation), Entrée / Espace (valider), Tab, Échap (retour, ferme un
     panneau). Manette : croix ou stick gauche, A valider, B retour, **Start = jouer**.
   - Contrôles / Réglages ouverts depuis le menu : Tab reste dans le panneau (le menu derrière le voile est inerte) ; le focus
     part sur la première option (sensibilité souris, bascule Xbox / PlayStation), pas sur « Retour ». Contrôles : **LB / RB**
     basculent les glyphes Xbox / PlayStation.
   - Les choix sont mémorisés (rechargement de la page). Paramètres d'URL toujours acceptés :
     `?size=5&role=pilier&difficulty=difficile&training`. `?debug` lance la partie tout de suite (sans pointer lock, session
     dans `window.__ovalgun.session`) ; `?debug&menu` passe par le menu ; `?debug&duration=20` = match de 20 s.
3. **En jeu** (`?debug`, ou par le menu) :
   - jauge de stabilité (bas au centre, contour sombre, lisible sur l'herbe) : fais-toi tirer dessus — elle tremble et flashe,
     la perte reste blanche un instant ; jaune sous 65 %, rouge + vignette sous 35 % ; plaqué : « PLAQUÉ 3,0 s » qui se remplit
     jusqu'au relevé ; après le relevé ou pendant un plongeon : « INVULNÉRABLE » ;
   - pastilles : esquive (Maj bref / B), glissade (C / X), capacité (A en AZERTY, Q en QWERTY / LB), arme (munitions, rouge à
     ≤ 25 % du chargeur, rechargement R / Y) ; porteur (G / View en entraînement) : plongeon, passe (avec le nom de la cible,
     « aucune cible » sinon) et coup de pied. Les touches affichées suivent le périphérique utilisé (glyphes PlayStation avec
     une manette Sony) ;
   - ballon hors champ (B / croix ↓ pour le lâcher au centre, puis tourne-toi) : flèche au bord, jaune (libre), couleur
     d'équipe (porté), dorée (mêlée), distance en mètres ; ballon derrière toi : en bas, au-dessus de la jauge ; ballon
     au-dessus de l'écran : sous le score ET sous son étiquette (« ENTRAÎNEMENT », « DERNIÈRE MINUTE »), sans la recouvrir ;
   - flux en haut à droite (plaquages, interceptions, essais, mêlées), annonces au centre (3, 2, 1, JOUEZ !, ESSAI !, MÊLÉE !,
     DERNIÈRE MINUTE), messages personnels à droite du réticule (« Aucun coéquipier derrière », « Interception ! »…) ;
   - dernière minute : `__ovalgun.session.state.clockTicks = 1900` (chrono rouge pulsant), puis `= 290` (dixièmes) ;
   - **aide à la visée après le menu** (manette) : `?debug&menu&size=3`, Start (partie 3v3), vise près d'un adversaire : la
     caméra ralentit sur chacun des 3 adversaires ; `__ovalgun.session.candidates` a 6 entrées, équipes 0, 0, 0, 1, 1, 1.
4. **Pause** : Échap (clavier, aussi en `?debug`) ou Start (manette).
   - Manette : cours au stick gauche, appuie sur Start **en gardant le stick** : le focus reste sur « Reprendre » tant que le
     stick n'est pas relâché (avant la correction, il défilait jusqu'à « Quitter vers le menu »).
   - « Recommencer » / « Quitter vers le menu » : un premier appui (A, Entrée, clic) fait passer le bouton au rouge « Confirmer
     … ? » pendant 2,5 s, un second appui exécute ; changer de bouton annule.
   - Reprendre : B ou Start (manette), Entrée / clic sur « Reprendre ». Au clavier hors `?debug`, Échap ne peut pas reprendre (le
     navigateur refuse le pointer lock demandé sur Échap) : l'aide n'affiche pas « Échap », et Échap met le focus sur
     « Reprendre ».
   - Réglages : sensibilités (curseurs : souris, flèches gauche / droite, croix), inversion Y, aide à la visée, vibrations —
     appliqués tout de suite et mémorisés. Contrôles : toutes les correspondances (bascule Xbox / PlayStation, LB / RB). Au
     retour d'un panneau, le focus revient sur son bouton ; l'anneau de focus jaune est entier (plus rogné à gauche / droite).
5. **Fin** : `?debug&duration=20`. Joueur du match suivi de son équipe (« Ailier 1 · Bleu »), statistiques, Rejouer / Menu
   actifs après 1,5 s (souris, Entrée, A) ; **Start = Rejouer**. Le A ou le Start maintenu au coup de sifflet n'agit pas (il
   faut le relâcher).
6. **Accessibilité** : activer « réduire les animations » dans le système : plus de pulsations ni de tremblements.

### Ce qu'on doit voir / ressentir

- Le menu se lit d'un coup d'œil et se pilote entièrement à la manette sans jamais perdre le focus (anneau jaune) ; la souris
  n'affiche pas d'anneau. Un stick ou un bouton maintenu en quittant le jeu ne fait rien dans le menu suivant.
- En jeu, l'essentiel est en bas au centre (jauge + actions) et en haut au centre (score) ; rien ne masque le joueur ni le
  réticule. En 21:9, le HUD reste groupé au centre ; en 900×600 tout reste lisible (le menu de lancement défile).
- Le A ou le Start qui ferme un menu ne fait pas sauter / ne rouvre pas la pause ; aucune action destructrice (recommencer,
  quitter, relancer depuis la fin) ne part sur un seul appui réflexe.
- Mesures (Playwright, 1280×720, fausse manette, SwiftShader) : menu -> partie 3v3 : 6 candidats d'aide à la visée, équipes
  0, 0, 0, 1, 1, 1 (avant la correction : 10, dont les ids 3 et 4 en équipe 0 et 4 fantômes) ; `?debug` -> pause -> quitter vers
  le menu : 0 erreur et le match de fond avance (avant : une exception par frame, fond figé) ; stick maintenu 1,2 s dans la
  pause : focus fixe sur « Reprendre » (avant : il parcourait la liste) ; ballon au-dessus de l'écran : haut de la pointe à
  84 px, sous l'étiquette du score (bas à 72 px ; avant : disque centré à 83 px, par-dessus l'étiquette).

### Constantes utiles pour ajuster le feeling

| Constante | Effet | Valeur actuelle | Piste de réglage |
|---|---|---|---|
| `MENU_NAV_REPEAT_DELAY_SEC` / `MENU_NAV_REPEAT_SEC` (constants.ts) | Délai avant répétition et intervalle de répétition de la croix / du stick dans les menus | 0,38 s / 0,11 s | 0,3 / 0,08 pour des listes plus longues ; 0,5 / 0,15 si le focus « file » trop vite |
| `MENU_NAV_STICK_THRESHOLD` (constants.ts) | Inclinaison du stick gauche qui compte comme une direction dans les menus | 0,55 | 0,7 si un stick usé fait bouger le focus tout seul |
| `SETTINGS_SENSITIVITY_MIN` / `_MAX` / `_STEP` (constants.ts) | Bornes et pas des curseurs de sensibilité (souris, caméra manette) | × 0,25 / × 3 / 0,05 | Pas 0,1 pour régler plus vite à la manette |
| `STYLE.endScreenInputDelaySec` (palette.ts) | Délai avant que Rejouer / Menu / Start acceptent un appui sur l'écran de fin | 1,5 s (1 s avant la correction) | 2 s si des joueurs relancent encore sans voir les statistiques |
| `STYLE.mvpWeights` (palette.ts) | Poids des statistiques du « joueur du match » (essais, plaquages, interceptions, passes) | 3 / 1 / 2 / 1 | Plaquages à 2 pour valoriser la défense |
| `STYLE.stabilityBarLowFraction` / `stabilityBarMidFraction` (palette.ts) | Jauge rouge (+ vignette) / jaune sous ces fractions | 0,35 / 0,65 | Rouge à 0,4 pour prévenir plus tôt |
| `STYLE.ammoLowFraction` (palette.ts) | Pastille d'arme rouge à cette fraction du chargeur ou moins (au moins 1 cartouche) | 0,25 | 0,4 pour prévenir plus tôt avec le fusil à pompe (5 cartouches : rouge à 2) |
| `STYLE.feedSec` / `feedFadeSec` / `feedMax` (palette.ts) | Durée, fondu et nombre de lignes du flux d'événements | 4,5 s / 0,6 s / 5 | 3 lignes en 5v5 si le flux se remplit trop |
| `STYLE.clockTenthsBelowSec` (palette.ts) | Chrono au dixième de seconde sous ce seuil | 10 s | 0 pour ne jamais afficher les dixièmes |
| `STYLE.spectator*` (palette.ts) | Caméra du match de fond du menu (hauteur, recul, suivi, balancement, champ) | voir palette.ts | `spectatorHeight` plus haut pour une vue plus lisible |
| `ARROW_REACH_REM` / `EDGE_REM` (ui/hud/BallArrow.svelte) | Rayon de la mini-flèche (marge des zones évitées) / marge aux bords de l'écran | 2,4 rem / 2,6 rem | Garder `EDGE_REM` ≥ `ARROW_REACH_REM` |
| `CONFIRM_MS` (ui/PauseMenu.svelte) | Fenêtre de confirmation de « Recommencer » / « Quitter » | 2 500 ms | 4 000 ms si la confirmation expire avant le second appui |
| `HUD_RATE` (ui/state/hud.svelte.ts) | Fréquence de publication du gros instantané du HUD (la flèche et le réticule suivent chaque frame) | 30 Hz | 20 Hz sur machine lente |

## Passe finale — simulation et bots

Correctifs de la passe finale de qualité côté simulation et bots (détails et décisions : docs/ARCHITECTURE.md §17).

### Comment tester

1. **Tests automatiques** : `npm test`. Nouveaux tests :
   - `tests/sim/movement.test.ts` : esquive avant réduite (latérale / arrière intactes), élan aérien qui s'éteint au-delà
     du sprint (maintenu ou relâché), « hacher sa course n'est pas plus rapide que le sprint » (porteur, trois rôles :
     sauts répétés ≤ sprint + 2 %, esquive en boucle et esquive + sauts ≤ sprint + 15 %), tampon d'esquive, jamais de −0
     (reculer avec yaw = 0, glissade bloquée contre le mur invisible), séparation et relief (pas de grimpe sans entrée
     contre un muret, pieds collés au sol sur une butte) ;
   - `tests/sim/carrier.test.ts` : `predictPassCatch` (point de réception = point visé par `planPass`, au bout de la durée
     de vol), plongeon aérien freiné ;
   - `tests/sim/rules.test.ts` : fin du match (joueur en l'air posé au sol), ballon mort dans l'arène ;
   - `tests/sim/determinism.test.ts`, `rules.test.ts` : les contrôles de valeurs pendant les matchs scriptés rejettent
     aussi les −0 ;
   - `tests/bots/behaviors.test.ts` : porteur sous le feu d'un tireur lointain, stabilité basse => passe ;
   - `tests/bots/match.test.ts` : au plus 5 % des passes au sol, marquage stable (≤ 40 changements de receveur par
     minute de marquage), bornes de rythme resserrées ;
   - `tests/architecture.test.ts` : WeakRef, FinalizationRegistry, SharedArrayBuffer et Atomics interdits dans sim / bots.
2. **En jeu** (`npm run dev`, `?debug&training`) :
   - porteur, Maj + Z maintenus : enchaîner esquives et sauts ne doit plus aller plus vite que le sprint (HUD de debug :
     vitesse) ; une esquive sur le côté reste un vrai dash (21 m/s), droit devant elle est plus courte (14,7 m/s) ;
   - appuyer sur esquive un poil avant la fin du cooldown : l'esquive part dès qu'il est fini ;
   - passer à un coéquipier bot qui courait ailleurs : il va chercher le ballon et le reçoit (avant : il dépassait la
     trajectoire dans ≈ 1 passe sur 8) ;
   - `?debug&autopilot` : les porteurs bots passent aussi sous le feu du dernier défenseur, les marqueurs ne zigzaguent
     plus entre deux attaquants.

### Mesures (bots contre bots, 6 min, composition du jeu, difficulté normale, seeds 1 à 24 ; avant : seeds 1 à 12)

| Mesure | 3v3 avant | 3v3 après | 5v5 avant | 5v5 après |
|---|---|---|---|---|
| Essais par match (min–max) | 12,8 (9–16) | **11,5** (5–16) | 10,0 (7–14) | **6,5** (3–12) |
| Passes tentées / reçues / interceptées | 102 / 91 / 1,0 | 171 / 169 / 1,5 | 109 / 91 / 2,2 | 175 / 171 / 2,3 |
| Passes au sol (ni reçues ni interceptées) | 10,5 (10 %) | **0,9** (0,5 %) | 15,7 (14 %) | **1,8** (1 %) |
| Ballon porté (part du jeu) | 60 % | 67 % | 48 % | 55 % |
| Joueurs au sol (temps-joueur) | 13,9 % | 14,6 % | 16,0 % | 17,4 % |
| Porteurs plaqués (ballon lâché) | 56,5 | 49 | 73,7 | 73,3 |
| Mêlées par match | 2,2 | 1,4 | 1,4 | 1,1 |
| Coups de pied par match | 1,8 | 0,6 | 1,3 | 0,9 |

Facile / difficile (seeds 1 à 8) : 3v3 21,0 / 9,6 essais (avant 19,4 / 12,9), 5v5 13,0 / 5,3 (avant 13,8 / 8,9).
Changements de receveur marqué par minute de marquage (seeds 1 à 4) : 46 -> 17 (3v3), 58 -> 32 (5v5) ; ping-pong
A -> B -> A en moins de 2 s : 11 -> 1,5 et 13 -> 5.

Porteur sur terrain plat, Maj + avant, vitesse moyenne sur 5 s (m/s) :

| Rôle | Sprint | Esquive en boucle (avant -> après) | Esquive + sauts (avant -> après) | Une esquive puis sauts (avant -> après) | Saut + plongeon en boucle (avant -> après) |
|---|---|---|---|---|---|
| Ailier | 10,64 | 12,91 -> 11,38 | 13,89 -> 11,16 | 12,71 -> 10,69 | 11,45 -> 11,13 |
| Pilier | 8,71 | 11,85 -> 9,91 | 14,00 -> 9,71 | 12,71 -> 8,79 | 11,30 -> 10,86 |
| Demi | 9,68 | 12,34 -> 10,65 | 14,00 -> 10,48 | 12,71 -> 9,74 | 11,67 -> 11,23 |

### Constantes utiles pour ajuster le feeling

| Constante | Effet | Valeur actuelle | Piste de réglage |
|---|---|---|---|
| `AIR_OVERSPEED_DECEL` | Extinction en l'air de la vitesse au-delà du sprint (m/s²) | 8 | 0 = élan aérien sans limite ; 15 = dash-saut à peine plus long qu'un saut |
| `DODGE_FORWARD_SPEED_MULT` | Vitesse d'une esquive droit devant (× `DODGE_SPEED`) | 0,7 | 1 = esquive avant comme latérale ; 0,8 si l'esquive avant paraît molle |
| `DODGE_BUFFER_SEC` | Tampon d'esquive | 0,12 s | 0 = appui trop tôt perdu |
| `BOT_RECEIVE_TIME_MARGIN_SEC` / `BOT_RECEIVE_ARRIVE_RADIUS` | Avance du receveur bot sur le ballon / rayon où il l'attend arrêté | 0,15 s / 0,4 m | 0,3 s si des passes tombent encore (il attend plus souvent arrêté) |
| `BOT_MARK_HYSTERESIS_M` / `BOT_MARK_DANGER_STICKY` | Stabilité du marquage | 3 m / 0,3 | 0 / 0 = ancien marquage (zigzag) ; 5 m pour un marquage « collant » |
| `BOT_SCRUM_SUPPORTERS` | Soutiens derrière la zone de mêlée quand l'équipe mène | 2 | 3 en 5v5 pour plus de passes à la sortie de mêlée |

## Passe finale — client, caméra et UI

Correctifs de la passe finale côté rendu, entrées, session et HUD (détails et décisions : docs/ARCHITECTURE.md §18). La
simulation et les bots ne changent pas : les tests de match bots contre bots passent à l'identique.

### Comment tester

1. **Tests automatiques** : `npm test`. Nouveaux tests :
   - `tests/render/polish.test.ts` : maths de l'estompage (`fadeMath.ts`), matériaux en alpha hash propres à chaque
     joueur, barre et étoiles masquées, joueur masqué presque transparent, axe du corps (debout / couché), halo
     d'invulnérabilité (couleur claire de l'équipe, faces arrière, < 3 Hz, fixe en « animations réduites »), une gerbe
     d'étincelles par cible et par tick, éclat de plaquage local réduit, `forceSinglePass` sur tous les transparents double
     face de toutes les vues, traînée coupée sur une téléportation, seuils du risque de passe ;
   - `tests/render/camera.test.ts` : pivot du porteur monté puis retour EXACT sur la droite de tir, collision balayée
     (ligne de vue jamais dans le relief, toutes formes des deux terrains), FOV de vitesse ;
   - `tests/input/inputLogic.test.ts` (esquive à l'enfoncement du porteur, sprint automatique), `haptics.test.ts`
     (vibrations des gestes du porteur, passe réussie), `tests/game/feedback.test.ts` (« Passe réussie → … »).
2. **En jeu** (`npm run dev`) :
   - coup d'envoi : le regard part légèrement vers le bas (plus de terrain et de coéquipiers, l'horizon vers 40 % de la
     hauteur au lieu du milieu) ;
   - porteur (`?debug&dummies=off`, ou G) : la caméra monte d'un mètre ; un défenseur droit devant à 6, 12 ou 20 m reste
     visible au-dessus de la tête du porteur ; en levant les yeux pour une chandelle, le corps du porteur gêne moins ;
   - porteur au clavier : il sprinte tout seul en avançant ; Maj esquive dès l'appui (même long) ; à la manette, L3 est
     inutile pour lui ;
   - passe : flèche, chevron et trait verts (receveur démarqué), ambre (risqué), rouge-orangé + « · marqué » sous la
     pastille (un adversaire près de la trajectoire) ;
   - passe réussie : « Passe réussie → Pilier 2 » près du réticule et petite vibration ; esquive, plongeon, passe, coup de
     pied vibrent légèrement à la manette ;
   - `?debug&autopilot&size=5` : un joueur qui passe contre la caméra se fond (tramage) au lieu de couvrir l'écran ; un
     joueur entre la caméra et soi devient translucide ; les mêlées ne font plus de nuage blanc d'étincelles ; un joueur
     qui se relève a un halo à la couleur claire de son équipe, sans clignoter, et garde sa couleur ;
   - à la manette (sans `?debug`) : le curseur disparaît en jeu ; Échap ou un alt-tab mettent en pause ;
   - pause puis reprise après un tir reçu : la jauge ne tremble pas et les scores ne « sautent » pas ;
   - HUD : « TOI » visible sous le score de son équipe ; demi : « Zone lente » en entier ; cible de passe lisible
     (≈ 10,5 px en 1280×720) ; au sol, toutes les pastilles sont barrées ;
   - zoom du navigateur (Ctrl + / Ctrl −) : le rendu reste net.

### Mesures (5v5, autopilote, pilier, 200 échantillons à 100 ms, SwiftShader)

| Mesure | Avant (audit) | Après |
|---|---|---|
| Autre joueur à moins de 1 m de la caméra (capsule) | 6–8 % du temps, opaque | 1,5 %, jamais plus de 50 % d'opacité |
| Étincelles visibles (moyenne / pic) | 20 / 120 (pool saturé) | 15,6 / 49 (pool 64) |
| Appels de dessin (moyenne / pic) | 194 / 426 | 168 / 278 |
| `material.version` maximal (programme recalculé à chaque image) | 11 370 après 25 s | 0 |
| FOV ailier porteur : sprint / esquive (au-dessus de 78°) | +2,2° / +6° | +5,5° / +6° |
| Ligne de vue de la caméra dans le relief (pire cas, grille de test) | 0,67 m | < 0,1 m |

### Constantes utiles pour ajuster le feeling

| Constante | Effet | Valeur actuelle | Piste de réglage |
|---|---|---|---|
| `CAMERA_CARRY_RAISE` | Montée de la caméra du porteur (m) | 1 | 0,6 si la vue paraît trop plongeante ; 1,3 pour voir encore plus loin devant |
| `KICKOFF_PITCH_DEG` | Regard au coup d'envoi (degrés) | −8 | −12 pour plus de terrain ; 0 = ancien cadrage |
| `CAMERA_FOV_SPEED_GAIN` | FOV ajouté par m/s au-delà de la course | 3 | 2 pour un effet plus discret |
| `CARRIER_AUTO_SPRINT` | Sprint automatique du porteur, esquive à l'enfoncement | oui | `false` = Maj / L3 comme les autres joueurs |
| `GAMEPAD_RUMBLE_EFFECTS.dodge` / `dive` / `passThrown` / `passCompleted` / `kick` | Vibrations des gestes du porteur | légères (priorité ≤ 2) | `strong` et `weak` à 0 pour couper un signal |

Réglages purement visuels (`src/render/palette.ts`) : `cameraFadeNear` / `cameraFadeFar` (0,4 / 1,8 m),
`lineFadeRadius` / `lineFadeMin` / `lineFadeBehind` (0,6 m / 0,35 / 0,6 m), `localFadeNear` / `localFadeFar`
(0,5 / 1,6 m), `fadeDetailsBelow` / `fadeHideBelow` (0,5 / 0,05) ; halo `invulnScale` / `invulnOpacity` / `invulnPulse` /
`invulnPulseRate` (1,22 / 0,75 / 0,15 / 9 rad/s) ; étincelles `sparkPoolSize` / `sparksPerHit` / `sparksPerPelletHit` /
`sparksPerTerrain` (64 / 3 / 4 / 4) ; `tackleBurstLocalScale` (0,5) ; `maxPixelRatio` (2) ; `trailTeleportSpeed` (55 m/s) ; couleurs du risque de passe
`PALETTE.passRisky` / `passMarked`.

## Passe finale — documentation, CI et contrôle final

README complet (lancement, déploiement, contrôles clavier ET manette, paramètres d'URL), ce guide relu et mis à jour
(valeurs vérifiées contre `src/sim/constants.ts`), docs/ARCHITECTURE.md rendu cohérent (§19) avec une section « Brancher le
mode online » (§20), intégration continue et déploiement GitHub Pages manuel. Aucune règle ni constante de jeu ne change.

### Comment tester

1. **Depuis un état propre** : `rm -rf node_modules dist && npm ci && npm run check` doit passer entièrement (c'est ce que
   fait la CI).
2. **CI** (`.github/workflows/ci.yml`) : à chaque push et pull request, Node 22, `npm ci`, `npm run typecheck`, `npm test`,
   `npm run build`. Résultat dans l'onglet *Actions* du dépôt (et sur la pull request).
3. **GitHub Pages** (`.github/workflows/pages.yml`, manuel uniquement) : une fois *Settings → Pages → Source : GitHub
   Actions* choisi, *Actions → Déploiement GitHub Pages → Run workflow*. Le workflow refait `npm run check`, publie `dist/`
   et affiche l'URL du site ; ouvrir l'URL : le menu s'affiche (le build en `base: './'` marche sous `/<dépôt>/`).
4. **Parcours complet** (souris / clavier puis manette) : menu -> choix 3v3, rôle, difficulté -> JOUER -> un essai -> pause
   (Échap / Start) -> Reprendre -> fin de match (`?debug&menu&duration=20` pour une fin rapide) -> Rejouer puis Menu. Console
   du navigateur sans erreur. Contrôle automatisé de la passe finale : script Playwright (Chromium headless + SwiftShader,
   clavier puis fausse manette injectée dans `navigator.getGamepads`, avec et sans `?debug`) qui fait ce parcours : 25
   vérifications, 0 erreur ni avertissement de console (détails : docs/ARCHITECTURE.md §19). Pour l'écrire soi-même : sous
   SwiftShader le jeu tourne à 16–25 images/s, il faut maintenir un bouton simulé plus d'une image (≈ 350 ms) pour qu'il
   soit lu.
5. **Liens** : README -> docs, sommaire de ce guide -> chaque section.

### Constantes utiles

Aucune modifiée. Mesure de contrôle (bots contre bots, 6 min, composition du jeu, chaque niveau joue les deux côtés, seeds
1 à 6) — part des points du niveau le plus faible face au niveau voisin : 3v3 facile / normal ≈ 17 %, normal / difficile
≈ 17 % ; 5v5 facile / normal ≈ 2 %, normal / difficile ≈ 9 %. Les marches de difficulté sont raides, surtout en 5v5 (sans
effet dans le jeu, où coéquipiers et adversaires ont la même difficulté). Pour les rapprocher : réduire les écarts de
`BOT_DIFFICULTY` (par exemple facile `reactionSec` 0,5 -> 0,42, `aimErrorDeg` 5 -> 4,5, `leadFraction` 0,4 -> 0,6), puis
ajouter le cas facile / normal au test « niveaux voisins » (`tests/bots/match.test.ts`). Voir docs/ARCHITECTURE.md §12.

## Aide-mémoire : réglage du feeling

Les 15 constantes qui pèsent le plus sur le **feeling du porteur** (courir, esquiver, passer — priorité absolue du cahier
des charges) et sur le **rythme** du match. Toutes dans `src/sim/constants.ts`. Valeurs actuelles ; « essais » = essais par
match de 6 min bots contre bots en difficulté normale (mesures des §15 et §17 de docs/ARCHITECTURE.md).

| # | Constante | Valeur | Effet | Sens de réglage |
|---|---|---|---|---|
| 1 | `CARRIER_SPEED_MULT` | 1,08 | Vitesse du porteur par rapport aux autres : le cœur du « grisant » | ↑ (1,10–1,12) course plus enivrante mais porteur plus dur à rattraper (plus d'essais) ; ↓ le porteur se fait reprendre |
| 2 | `SPRINT_SPEED_MULT` | 1,12 | Sprint de tous (porteur × 1,08 × 1,12 = × 1,21) ; premier levier du rythme | ↑ 1,15 ≈ +1 essai, 1,22 ≈ +3 en 3v3 ; ↓ jeu plus « collé », défense plus facile |
| 3 | `ROLES.<rôle>.runSpeed` | pilier 7,2 · demi 8,0 · ailier 8,8 m/s | Vitesse de base de chaque rôle | Monter ou descendre tout le monde de 5–10 % (jeu plus ou moins nerveux) en gardant les écarts entre rôles |
| 4 | `GROUND_ACCEL` | 75 m/s² | Démarrages et changements d'appui (réactivité du stick / des touches) | ↑ 100 plus sec, ↓ 50 plus d'inertie (plus « lourd ») |
| 5 | `GROUND_OVERSPEED_DECEL` | 15 m/s² | Durée de l'élan en trop après une esquive, une glissade, une grimpe, la fin d'un sprint | ↓ 10 élan long et glissant ; ↑ 25 retour rapide à la vitesse de course |
| 6 | `DODGE_SPEED` (avec `DODGE_DURATION_SEC`) | 21 m/s / 0,16 s (≈ 3,5 m) | Distance et brutalité de l'esquive latérale, la feinte qui fait rater les tirs | Garder 3–4 m ; plus rapide et plus court = plus sec |
| 7 | `CARRIER_DODGE_COOLDOWN_SEC` | 0,8 s | Fréquence des esquives du porteur (sans ballon : `DODGE_COOLDOWN_SEC` 1,4 s) | ↓ 0,6 porteur insaisissable ; garder plus court que sans ballon (cahier des charges) |
| 8 | `DODGE_FORWARD_SPEED_MULT` | 0,7 | Esquive droit devant réduite : l'esquive feinte, le plongeon accélère | ↑ 1 : esquives vers l'avant en boucle ≈ +21 % sur le sprint (à éviter) ; 0,8 si l'esquive avant paraît molle |
| 9 | `DIVE_SPEED` (avec `DIVE_RECOVER_SEC`) | 17 m/s / 0,35 s | Plongeon ≈ 6 m intouchable 0,3 s puis temps au sol : franchir les derniers mètres | Garder 5–7 m de dash ; ↓ récupération (0,25) plongeon plus fluide, ↑ (0,45) plus risqué |
| 10 | `PASS_SPEED` | 17 m/s | Tension des passes : temps de vol, risque d'interception | ↑ 19–20 passes tendues, plus sûres ; ↓ passes lobées plus faciles à couper |
| 11 | `PASS_AIM_LATERAL_GAIN` | 2,5 | Coup d'œil nécessaire pour choisir le côté de la passe | ↑ 3–4 si l'on doit trop tourner la caméra ; ↓ 1,5 si la cible saute trop |
| 12 | `CAMERA_FOV_SPEED_GAIN` (avec `CAMERA_DISTANCE_CARRY`) | 3 °/(m/s) (plafond 6°) / 5,4 m | Sensation de vitesse : le champ s'ouvre au sprint ; recul de la caméra du porteur | Gain 0 = coupé, plafond 8° effet « warp » ; recul 6 m pour mieux lire le jeu |
| 13 | `CARRIER_DAMAGE_MULT` | 1,3 | Dégâts subis par le porteur : combien de temps il survit sous le feu | ↑ 1,5 défense plus forte (moins de ballon porté, plus de joueurs au sol) ; ↓ 1,1 porteur plus durable (plus d'essais) |
| 14 | `FIELD_SCALE_3V3` | 0,84 (70 % de la surface du 5v5) | Taille du terrain 3v3 : espace à couvrir | ↑ 0,9 ≈ −1,5 essai en 3v3 ; ↓ 0,7 ≈ +3 essais |
| 15 | `BOT_COVER_MIN_DEFENDERS` | 2 | Dès N bots debout, un défenseur reste toujours en repli devant le porteur | ↑ 3 : à deux bots debout, le repli n'est plus permanent (défense plus agressive, mais plus de porteurs seuls devant le dernier rideau) ; laisser 2 pour que le porteur ait toujours un défenseur à battre |

**Méthode** : une constante à la fois ; `npm run test:watch` pendant le réglage (les tests de mouvement relisent les
constantes et vérifient les invariants du feeling : glissade plus rapide que la course, « hacher sa course » jamais plus
rapide que le sprint, porteur le plus rapide…) ; ressentir avec `?debug&training` (HUD de debug : vitesse, mouvement,
cooldowns) au clavier PUIS à la manette ; mesurer le rythme avec `npx vitest run tests/bots/match.test.ts` (bornes : 4–16
essais en 3v3, 4–12 en 5v5, ballon porté ≥ 55 % / 45 %) et observer avec `?debug&autopilot` (`&size=5`).

À surveiller ensuite : `BOOST_SPEED_MULT` (1,1 : ailier porteur boosté), `AIR_OVERSPEED_DECEL` (8 : borne l'élan aérien,
0 = esquive + sauts plus rapides que tout sprint), `KICKOFF_FREEZE_SEC` / `TRY_PAUSE_SEC` (2 s / 2 s : temps figé par essai),
`BOT_RESTRAINED_PAUSE_MULT` (2,5 : discipline de tir des bots hors pression, ↑ = moins de joueurs au sol),
`REGEN_DELAY_SEC` (2 s, cahier des charges).

## Personnages 3D

### Comment tester

- `npm run dev` : les cartes de rôle du menu montrent chaque classe en 3D, et le match de fond aussi.
- Joue chaque rôle (`?debug&role=pilier`, `ailier`, `demi`) : course dans les quatre directions, saut, glissade (C),
  esquive, porter le ballon (G), passe (E), coup de pied (F), plongeon (C en portant), se faire plaquer, bouclier du
  pilier (A), zone du demi (A), célébration après un essai.
- `npx vitest run tests/render/characters.test.ts` : logique d'animation, skins, cohérence des GLB avec le code.

### Ce qu'on doit voir

- Trois silhouettes reconnaissables de loin : pilier blindé et trapu, ailier fin à crête, demi avec sacoche et gros tube.
- La couleur d'équipe toujours lisible (crête / tenue / veste), contour cartoon, halo clair épais pendant l'invulnérabilité.
- Le haut du corps vise là où vise le joueur, le bas du corps suit le déplacement (pas chassé, marche arrière).

### Réglages (visuels, `CHARACTER_STYLE` dans src/render/palette.ts ; modèles et skins dans src/render/characters/characterDefs.ts)

| Réglage | Effet | Valeur | Piste |
|---|---|---|---|
| `CHARACTERS.<rôle>.headScale` | Taille de la tête (style cartoon) | 1,2 – 1,3 | ↑ 1,4 plus « chibi » |
| `CHARACTERS.<rôle>.widthScale` | Carrure | pilier 1,22 · ailier 0,95 · demi 1,05 | écarter pour des silhouettes plus contrastées |
| `SKINS.<id>.colors` | Couleur de chaque matériau (fixe ou `{ team }`) | — | changer la zone à la couleur d'équipe |
| `outlineWidth` / `invulnOutlineWidth` | Épaisseur du contour / du halo d'invulnérabilité | 0,016 / 0,045 m | ↑ contour plus BD |
| `runClipSpeed` | Vitesse au sol qui correspond au cycle de course à vitesse 1 | 6 m/s | ↓ si les pieds « patinent » |
| `aimChestFraction` | Part du pitch de visée portée par le buste | 0,6 | ↑ buste plus penché en visant haut/bas |
| `gunScale` | Taille des armes tenues | 1,45 | ↑ armes plus « jouet » |
| `slideTilt` / `diveTilt` | Bascule en glissade / plongeon | −1,0 / 1,3 rad | — |

Ajouter un modèle : ajouter son nom dans `MODELS` de `scripts/build-characters.mjs`, relancer le script sur le dossier
glTF du pack Quaternius, déclarer le fichier dans `CHARACTER_MODELS` et une skin dans `SKINS`.

## Son

### Comment tester

- Le son démarre au premier clic ou à la première touche (règle des navigateurs). Menu : musique ; navigation (tic) et
  validation (tac). Réglages : volume général et volume de la musique, appliqués tout de suite.
- En partie : compte à rebours (3, 2, 1, sifflet), pas, tirs (un son par arme), impacts, hitmarker et « ding » de
  plaquage quand c'est toi, chute et sons de passe / réception / coup de pied, sifflet + foule + fanfare (ou thème de
  défaite) à l'essai, cor de mêlée, alarme de dernière minute, long coup de sifflet de fin. La foule monte quand un
  porteur approche de l'en-but adverse ; le cœur bat quand ta stabilité est basse. Les sons des autres viennent de
  leur direction (casque conseillé).
- `npx vitest run tests/audio` : choix des sons, foule, compte à rebours, musique.

### Réglages (`AUDIO_MIX` dans src/audio/AudioEngine.ts, `SYNTH_LEVEL` dans src/audio/synth.ts)

| Réglage | Effet | Valeur | Piste |
|---|---|---|---|
| `sfx` / `ui` / `ambience` / `music` | Volume de chaque bus | 0,8 / 0,7 / 0,5 / 0,45 | équilibrer effets et musique |
| `crowdBase` / `crowdMax` | Foule au repos / au maximum d'excitation | 0,06 / 0,32 | ↑ ambiance de stade plus présente |
| `refDistance` / `rolloff` | Atténuation des sons lointains | 5 m / 1,1 | ↑ rolloff : les sons lointains s'effacent plus vite |
| `heartbeatBelow` | Seuil de stabilité des battements de cœur | 35 % | ↓ alerte plus tardive |
| `maxVoices` | Voix simultanées max | 28 | ↓ si le mixage sature |
| `SYNTH_LEVEL.<son>` | Niveau d'un son | — | monter / baisser un son précis |

## Décor : ville et ciel

### Comment tester

- Menu (`npm run dev`, http://localhost:5173/) : derrière le match bots contre bots, tribunes pleines, toit rose et
  blanc, ville au-dessus du toit, ciel bleu avec nuages. En partie (`?debug`, puis `?debug&size=5`) : tribunes aux
  couleurs des équipes derrière les en-buts, panneaux publicitaires lisibles le long du terrain, écran « OVALGUN »
  derrière chaque en-but, 4 pylônes aux coins, ville qui dépasse des tribunes, dirigeable, montgolfières, oiseaux.
  En levant les yeux (côté +X / −Z) : soleil plat avec liseré et halo.
- Foule : elle sautille doucement ; marquer un essai (`G` = ballon pour moi, puis courir dans l'en-but) la fait sauter
  bras levés quelques secondes ; elle s'agite aussi quand un porteur approche de l'en-but adverse. En console
  (`?debug`) : `__ovalgun.session.renderer.tryHype = 1`.
- Le terrain et les joueurs restent lisibles : le décor est au-delà des tribunes, à 10 m des murs au moins, et la
  caméra ne le traverse jamais (même plaquée contre la bordure).
- Coût : en console, `__ovalgun.session.renderer.renderer.info.render.calls`, avec et sans
  `__ovalgun.session.renderer.environment.group.visible = false` (≈ 20 appels de dessin pour tout le décor).
- `npx vitest run tests/render/environment.test.ts` : placement déterministe, rien dans la place du stade, portée de la
  caméra, budget d'appels de dessin, reconstruction et libération, excitation de la foule.

### Réglages (`ENVIRONMENT` dans src/render/palette.ts ; brouillard : `PALETTE.fog`, `STYLE.fogNear` / `fogFar`)

| Réglage | Effet | Valeur | Piste |
|---|---|---|---|
| `sunDirection` | Direction du soleil (ciel ET lumière directionnelle) | (18, 16, −10), ≈ 38° | ↑ y : soleil plus haut, ombrage plus vertical |
| `skyTop` / `skyMid` / `skyHorizon` | Dégradé du ciel (l'horizon = brouillard) | bleu vif → bleu pâle | garder `PALETTE.fog` = `skyHorizon` |
| `STYLE.fogNear` / `fogFar` | Brume de la ville | 110 / 480 m | ↓ fogFar : ville plus fondue, moins chargée |
| `standsGap` | Distance bordure -> tribunes | 10 m | ne pas descendre sous ≈ 8 m (caméra épaule) |
| `standsRows` / `standsRowDepth` / `standsRowRise` | Gradins | 9 / 1,5 m / 0,7 m | ↑ rangs : stade plus haut, ville moins visible |
| `crowdFill` / `crowdSpacing` | Densité de la foule (coût en triangles) | 0,68 / 0,9 m | ↓ fill si la carte graphique peine |
| `jumpIdle` / `jumpMax` / `jumpRate` | Bonds au repos / en délire, cadence | 0,06 / 0,6 m / 7 rad/s | — |
| `crowdTryDecaySec` / `crowdNearTryDist` / `crowdNearTryExcitement` | Excitation après un essai, près de l'en-but | 4,5 s / 18 m / 0,55 | — |
| `heightNear` / `heightFar` / `towerShareFar` | Hauteurs de la ville, part de tours au loin | 10–22 / 34–95 m / 0,24 | ↓ pour une skyline plus calme |
| `windowLitShare` / `windowGlow` | Fenêtres allumées | 0,1 / 0,35 | ↑ ville plus « vivante », plus de scintillement |
| `facades` / `towerFacades` / `roofs` | Couleurs de la ville | pastel / verre teinté / toits vifs | — |
| `cloudCount` / `cloudDriftRate` | Nuages, dérive | 18 / 0,004 rad/s | — |
| `glowSize` / `glowOpacity` | Halo des projecteurs | 11 m / 0,32 | ↓ si les halos gênent en regardant vers un coin |
