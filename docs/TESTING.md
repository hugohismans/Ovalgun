# Ovalgun — Guide de test et de réglage

Ce guide dit, étape par étape, **comment tester** ce qui vient d'être livré, **ce qu'on doit ressentir ou voir**, et
**quelles constantes toucher** pour ajuster le feeling. Toutes les constantes de gameplay sont dans
`src/sim/constants.ts` (une modification est prise en compte au prochain `npm test` ou rechargement de `npm run dev`).
Vérification complète du projet : `npm run check` (typecheck + tests + build).

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
     8,8 m/s en course, 21 pendant le dash, puis 12,6 qui redescend doucement vers 8,8.
   - Rejouer le même script donne le même `hashState` : c'est le déterminisme.
   - Pour simuler une manette, utiliser une entrée analogique : `makeInput({ moveX: 0.94, moveY: 0.34, buttons: sim.Buttons.SPRINT })`
     correspond à un stick poussé à fond à 70°. On doit obtenir environ 8,3 m/s : en pas chassé, le sprint ne s'applique pas.

### Ce qu'on doit ressentir / voir (vérifié par les tests)

- **Course** : vitesse de pointe atteinte en moins de 0,2 s, et arrêt aussi rapide. Ordre des rôles : pilier (7,2) < demi (8,0) < ailier (8,8 m/s).
  Le porteur va 8 % plus vite. Le sprint ne marche qu'en avançant (y compris en diagonale à 45°) et pas en visée.
- **Manette** : un stick peu incliné fait marcher lentement. La pleine vitesse arrive à 90 % d'inclinaison.
  Pour sprinter, il faut pousser le stick franchement (au moins 70 %) et vers l'avant (cône d'environ ±50°).
  Un appui « esquive puis saut » rapide (B puis A) n'est jamais perdu : le saut part pendant le dash (dash-saut).
- **Esquive** : dash d’environ 3,5 m en 0,16 s. En sortie, l'élan porte : 12,6 m/s qui redescend à la vitesse de course
  en un quart de seconde environ, sans arrêt sec. Cooldown 1,4 s, ramené à 0,8 s pour le porteur. Elle marche aussi en l'air,
  et l'élan est conservé jusqu'à l'atterrissage même en maintenant la direction.
- **Glissade** : uniquement en courant au-dessus de 5,5 m/s, et pas pour le porteur (C = plongeon, étape 4).
  Elle donne un boost (×1,35) avec une hitbox basse, puis décélère. Elle va plus loin que la course sur sa durée.
  On peut sauter depuis une glissade en gardant l'élan.
- **Saut** : hauteur d'environ 1,3 m. Coyote time de 0,1 s et tampon de saut de 0,12 s. Double saut : ailier seulement.
- **Terrain** : on monte les petites marches sans ralentir. Un muret bas abordé de face (ou en biais jusqu'à environ 66°)
  est grimpé sans arrêt, en perdant 25 % d'élan. Un muret qu'on frôle en le longeant ne fait rien de spécial : on passe à côté.
  Aucune traversée de muret, même en esquive répétée. Murs invisibles sur les bords.
  Les deux camps sont symétriques, et le 3v3 utilise un terrain à 70 %.
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
| `SPRINT_SPEED_MULT` | Bonus de vitesse du sprint | 1,22 | Entre 1,15 et 1,3 ; au-delà, le porteur devient difficile à rattraper |
| `SPRINT_MIN_FORWARD_COS` | Largeur du cône avant dans lequel le sprint s'applique (cos de l'angle) | 0,64 (≈ 50°) | Descendre vers 0,5 (60°) pour sprinter plus en biais ; ne pas passer au-dessus de 0,7, sinon la diagonale clavier ne sprinte plus |
| `SPRINT_MIN_TILT` | Inclinaison du stick nécessaire pour sprinter | 0,7 | Monter vers 0,85 si la manette sprinte par erreur |
| `MOVE_INPUT_FULL_SPEED` | Inclinaison du stick qui donne la pleine vitesse | 0,9 | Descendre vers 0,75 si les sticks usés n'atteignent pas le bord |
| `CARRIER_SPEED_MULT` | Bonus de vitesse du porteur | 1,08 | Priorité du feeling porteur : essayer 1,1 à 1,12 |
| `DODGE_SPEED` / `DODGE_DURATION_SEC` | Vitesse et durée du dash (distance ≈ produit) | 21 m/s / 0,16 s | Garder la distance vers 3 à 4 m ; un dash plus court et plus rapide paraît plus sec |
| `DODGE_EXIT_SPEED_KEEP` | Part de la vitesse du dash gardée à la sortie | 0,6 (12,6 m/s) | Baisser vers 0,5 si l'esquive donne trop de vitesse, monter vers 0,7 pour enchaîner plus fluidement |
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
   Menu / Options pour jouer, sans capturer la souris. Stick gauche : déplacement. Stick droit : caméra. A : saut.
   B : esquive. X : glissade. L3 : sprint (bascule). LT : visée. Start : pause.
   À essayer :
   - débrancher la manette en jeu : la partie se met en pause et l'overlay repasse au clavier ;
   - poser la manette et jouer au clavier : une légère dérive du stick ne fait pas basculer l'overlay sur la manette ;
   - avec deux manettes, utiliser la seconde : c'est elle qui est lue.
   La manette vibre lors d'un atterrissage brutal. Les autres vibrations arriveront avec les plaquages et les essais.
4. **Mode debug** : ajouter `?debug` à l'URL (ex. `http://localhost:5173/?debug`). Pas d'overlay ni de pause, le clavier
   marche sans capturer la souris, et la session est exposée dans la console (`__ovalgun.session.state`).
   Pour essayer la caméra porteur avant l'étape 4, coller dans la console :
   `__ovalgun.session.state.ball.mode = 'carried'; __ovalgun.session.state.ball.carrierId = 0;`
   (le ramassage du ballon libre n'arrive qu'à l'étape 4 ; recharger la page pour revenir au départ).

### Ce qu'on doit voir / ressentir

- **Caméra épaule** : la caméra est derrière l'épaule droite, avec un vrai vide entre la tête et le réticule. Un tir
  partira exactement vers le réticule (c'est la même droite que dans la sim). Elle se rapproche en visée.
  Quand on porte le ballon, elle recule, même si l'on tient la visée : le porteur ne vise pas, sa caméra et ses
  sensibilités ne changent pas et son sprint L3 continue. Le champ de vision s'élargit un peu au sprint et pendant
  l'esquive, plafonné à +6° (pas de « coup de zoom » à chaque esquive).
- **Fluidité** : le mouvement reste fluide au-delà de 30 Hz d'affichage (position et rotation du ballon interpolées).
  La visée réagit à chaque image. Pause et reprise ne font pas reculer l'image.
- **Clavier** : un appui très bref (saut, esquive) n'est jamais perdu. Maj tapé = esquive au relâchement. Maj
  maintenu = sprint seul : l'esquive reste disponible pour le défenseur qui arrive.
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
| `CAMERA_FOV_SPEED_GAIN` / `CAMERA_FOV_SPEED_MAX_BONUS` | FOV ajouté par m/s au-delà de la course, et son plafond | 1,2 °/(m/s) / 6° | 2 et 8 pour un effet « warp » ; gain à 0 pour le couper |
| `CAMERA_BLEND_RATE` | Vivacité des transitions de caméra (1/s) | 10 | Monter (15) pour des transitions plus sèches |
| `CAMERA_GROUND_MARGIN` / `CAMERA_MIN_DISTANCE` | Collision caméra / sol | 0,3 / 0,9 m | Monter la marge si la caméra frôle le sol en regardant en l'air |
| `MOUSE_SENSITIVITY` / `MOUSE_AIM_SENSITIVITY_MULT` | Sensibilité souris (rad/px), et multiplicateur en visée | 0,0022 / 0,6 | Réglage personnel ; un menu d'options viendra plus tard |
| `SPRINT_HOLD_DELAY_SEC` | Maintien de Maj avant le sprint (et durée max d'un tape d'esquive) | 0,15 s | Baisser (0,12) si le sprint semble tarder, monter si des esquives partent en sprint |
| `KEYBOARD_DODGE_ON_RELEASE` | Esquive clavier au relâchement (sprint sans esquive) ou à l'enfoncement (latence nulle, mais chaque sprint commence par une esquive) | oui | Passer à `false` si l'esquive au clavier semble en retard |
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
