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
- **Coup de pied** : une chandelle (48°) qui part loin devant : environ 36 m sans courir en 5v5, 26 m en 3v3 (un peu plus
  en courant). Regarder plus haut donne plus de cloche. Un anneau et une fine balise blanche montrent le point de chute
  prévu pendant que tu portes. Au départ, seul un adversaire collé à toi (moins de 1,5 m) peut le **contrer** ; ensuite,
  personne ne porte le ballon en vol : coéquipiers et adversaires peuvent l'attraper (réceptionné par l'adversaire, ce
  n'est pas une « interception » : pas de vibration ni de texte). Toi, tu ne peux pas pendant 0,7 s, puis tu peux le
  rattraper (« chip and chase »). Après le premier rebond, il redevient libre (cercle jaune).
- **Plongeon** : un dash bas d'environ 6 m dans le sens du regard, ou en diagonale si tu pousses vers l'avant-côté. Le
  joueur s'aplatit et une coque blanche clignote : il est intouchable pendant 0,3 s. Ensuite, il glisse au sol en freinant
  pendant 0,35 s et repart en course à ~4 m/s. Sur une seconde, ça couvre à peu près la distance d'un sprint : c'est un
  outil pour aplatir ou passer un défenseur, pas une accélération gratuite. Cooldown 2 s. On peut plonger depuis un saut
  (« essai en vol ») : l'élan est gardé jusqu'au sol. Plonger contre un muret le fait franchir, puis on reste au sol quand
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
| `KICK_SPEED` / `KICK_ELEVATION_DEG` | Puissance (× √ échelle du terrain) et angle du coup de pied (portée ≈ v²·sin 2θ / g) | 25 m/s / 48° | ~36 m en 5v5 et ~26 m en 3v3 à l'arrêt ; baisser l'angle (40°) pour un coup de pied plus tendu, plus facile à contrer |
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
- **Porteur** : il ne tire jamais (pas de traceur, pas de munition consommée) et encaisse ×1,1.
- **Au sol** : pas de tir, pas de déplacement, pas de ramassage ; les balles le traversent. Relevé sur place, jamais de respawn.
  Le corps glisse ≈ 1 m au plus et ne franchit pas les murets.
- **Plaquage lisible** : éclat jaune, onde blanche au sol, capsule couchée et étoiles, texte et vibration forte (manette).
- **Retours de visée** : hitmarker à chaque touche (rouge et plus gros au plaquage), indicateurs de direction des tirs reçus qui
  suivent le tireur quand tu tournes la caméra, vignette rouge sous 50 % de stabilité, flash rouge bref à chaque balle reçue.
- **Mini-HUD provisoire** (en bas) : jauge de stabilité (rouge et pulsante sous 35 %), munitions / rechargement, capacité
  (active / cooldown / prête), esquive. Le vrai HUD arrive à l'étape 8.

### Temps pour plaquer (mesuré, précision parfaite)

Ailier sur une cible immobile, toutes les balles touchent (en visée, la dispersion reste dans la capsule jusqu'à ~70 m).
Formule : n = ⌈100 / (dégâts × atténuation × porteur)⌉ balles, (n − 1) intervalles de 2 ticks, plus le vol de la dernière balle
(10 m par tick). Vérifié au tick près par `tests/sim/combat.test.ts` (« temps pour plaquer »). Le premier tir part à t = 0.

| Distance | Cible | Dégâts / balle | Balles | Temps |
|---|---|---|---|---|
| 10 m | non-porteur | 5 | 20 | 38 ticks ≈ **1,27 s** |
| 10 m | porteur | 5,5 | 19 | 36 ticks ≈ **1,20 s** |
| 25 m | non-porteur | 5 | 20 | 40 ticks ≈ **1,33 s** |
| 25 m | porteur | 5,5 | 19 | 38 ticks ≈ **1,27 s** |
| 35 m | non-porteur | 4,1 | 25 | 51 ticks ≈ 1,70 s |
| 35 m | porteur | 4,5 | 23 | 47 ticks ≈ 1,57 s |

Repères : un chargeur (30) suffit toujours ; la régénération remonte une jauge vide en 2,2 s après 2 s de répit ; à deux tireurs,
diviser à peu près les temps par deux. Un porteur qui zigzague et esquive fait rater des balles et tient bien plus longtemps.
Porteur ailier boosté au sprint : ≈ 13,9 m/s, contre 10,7 m/s pour un ailier qui le poursuit au sprint.

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
| `CARRIER_DAMAGE_MULT` | Dégâts subis par le porteur | 1,1 | 1,25 pour une défense plus forte ; 1 si le porteur tombe trop vite |
| `REGEN_DELAY_SEC` / `REGEN_RATE` | Répit avant régénération, vitesse de remontée (points/s) | 2 s / 45 | Cahier des charges : 2 s ; baisser le taux (30) pour que les dégâts « collent » plus |
| `DOWN_DURATION_SEC` / `GETUP_DURATION_SEC` / `GETUP_INVULN_SEC` | Au sol, relevé, invulnérabilité après relevé | 2,5 / 0,5 / 0,6 s | Cahier des charges : 2,5 s au sol ; monter l'invulnérabilité si l'on se fait replaquer en se relevant |
| `TACKLE_SLIDE_MAX_SPEED` / `TACKLE_SLIDE_DECEL` | Glissade du corps plaqué : vitesse max au plaquage, freinage | 7 m/s / 20 m/s² | Freinage 30 pour une chute plus sèche ; vitesse 9 pour une glissade plus spectaculaire |
| `TACKLE_DROP_POP_FORWARD` / `TACKLE_DROP_POP_UP` | Rebond du ballon lâché (avant / haut, m/s) | 2,5 / 4 | Monter l'avant (4) pour plus de « courses au ballon » |
| `TACKLE_DROP_CARRY_KEEP` / `TACKLE_DROP_MAX_CARRY` | Part de la vitesse du porteur transmise au ballon, plafond | 0,3 / 4 m/s | 0 : le ballon tombe toujours au même endroit ; plafond 6 pour des lâchers plus longs en sprint |
| `BOOST_SPEED_MULT` / `BOOST_ACCEL_MULT` | Sprint boosté de l'ailier : vitesse, accélération | 1,2 / 1,4 | 1,3 pour un boost plus grisant (porteur boosté presque intouchable) |
| `ROLES.ailier.ability.duration` / `cooldown` | Durée et cooldown du sprint boosté (le cooldown démarre à la fin) | 3 s / 9 s | 2 s / 8 s pour un boost plus « coup de rein » |
| `LAST_MINUTE_COOLDOWN_MULT` | Dernière minute : rechargement, capacité, esquive, glissade, plongeon (pas la cadence de tir) | 0,7 | — |
| `TURRET_LEAD_FRACTION` | Avance prise par les tourelles sur une cible qui court | 1 | 0,5 pour s'entraîner contre des tourelles qu'on esquive en courant |
| `TURRET_*` (autres) | Tourelles : portée, rotation, réaction, rafales, pauses, imprécision | 0,85 / 200°/s / 0,5 s / 0,5 s / 0,9 + 0,6 s / 1,6° + 0,5° | Monter l'erreur (3°) pour s'entraîner sous un feu moins précis |
| `GAMEPAD_RUMBLE_EFFECTS.hitTaken` / `.tackled` / `.tackleDealt` | Vibrations : tir reçu, plaquage subi, plaquage réussi | — | Mettre `strong` et `weak` à 0 pour couper |

`TACKLE_PICKUP_BLOCK_SEC` (0,5 s) n'est qu'une sécurité : il ne compte que si l'on raccourcit beaucoup la durée au sol.

Réglages purement visuels (traceurs, convergence vers le canon, flashs, étincelles, clignotement, barres de stabilité, chute,
étoiles, durées du hitmarker et des indicateurs, seuil de la vignette) : `src/render/palette.ts` (`PALETTE`, `STYLE`, `FX`).
