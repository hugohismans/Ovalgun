# Ovalgun — Architecture et décisions de conception

Ce document est la référence technique commune. Le cahier des charges d'origine est dans `docs/SPEC.md`.
Langue : identifiants de code en anglais, commentaires et documentation en français.

## 1. Vue d'ensemble des modules

```
src/
  sim/     Simulation PURE (aucune dépendance à Three.js, DOM, Svelte, window, Node).
           Tourne telle quelle dans un Cloudflare Worker. Compilée par tsconfig.sim.json (lib ES2022 seule).
  bots/    Producteurs de PlayerInput. PURS aussi (même contrainte que sim). Lisent MatchState, ne le modifient jamais.
  render/  Three.js. Lit deux MatchState (précédent / courant) et interpole. Ne modifie jamais l'état.
  input/   Clavier/souris (pointer lock) ET manette (Gamepad API) -> un PlayerInput par tick.
           Remapping via keymap.ts / gamepadMap.ts (données, pas de touches en dur).
  game/    Colle côté client : boucle à pas fixe, assemblage des entrées (humain + bots), appel de step(), alimentation du rendu et du HUD.
  ui/      Svelte 5 (runes) : menu, HUD, overlays.
tests/     Vitest (environnement node) : simulation, bots, architecture.
```

Graphe de dépendances autorisé (une flèche = « peut importer ») :

```
ui ──> game ──> render ──> sim
 │       ├────> input ───> sim
 │       └────> bots ────> sim
 └─────────────> input   (libellés des touches / glyphes manette de l'overlay)
```

`sim` n'importe rien hors de `src/sim`. `bots` n'importe que `src/sim` (et `src/bots`).
Hors de `src/sim`, la simulation ne s'importe QUE par son API publique `src/sim/index.ts` (`from '../sim'`).
`render` n'importe ni `input`, ni `game`, ni `ui` ; `input` n'importe ni `render`, ni `game`, ni `ui` ; `game` n'importe pas `ui` ;
`ui` n'importe que `game` et `input`.
Le test `tests/architecture.test.ts` (fichiers `.ts` ET balises `<script>` des `.svelte`) et `npm run typecheck`
(tsconfig.sim.json) font respecter ces règles.

## 2. Contrat de la simulation

API publique (`src/sim/index.ts`) :

```ts
createMatch(config: MatchConfig): MatchState
step(state: MatchState, inputs: InputFrame, dt?: number): MatchState // mute en place ET renvoie le même objet
cloneState(state: MatchState): MatchState                              // copie profonde (JSON-safe)
hashState(state: MatchState): string                                   // FNV-1a sur JSON.stringify (tests, vérif. client/serveur)
NEUTRAL_INPUT, makeInput(partial), Buttons, constantes, types…
createField, groundHeight, supportHeight, groundNormal, faceContact      // terrain, partagé avec le rendu
aimOrigin(feet, yaw)                                                    // origine de visée (§3), partagée avec la caméra
carryPosition(feet, yaw, out?)                                          // position du ballon porté, partagée avec le rendu
placeTeamInFormation, formationSlot                                     // placement (remises en jeu)
selectPassTarget(state, carrierId, yaw) -> PassTarget | null            // visée assistée (PURE : le rendu l'appelle à chaque frame)
passAimDirection(team, yaw), planPass, kickLaunch, predictBallLanding,  // trajectoires du porteur (PURES : rendu, bots)
ballisticVelocity, ballSpeedMult, backwardZ, canShoot, canCarrierAct
debugGiveBall(state, id), debugResetBall(state)                         // OUTILS DE TEST, entre deux step (?debug / entraînement)
fireOverridesSprint, fireIntervalTicks, spreadDirection, weaponImplemented // tir (étape 5, PURES : HUD, bots, tests)
damageFalloff, damageAmount, isHittable                                 // dégâts, cible touchable
segmentCapsuleEntry, segmentTerrainEntry                                // intersections balayées des projectiles
abilityActive, abilityImplemented                                       // capacités (étape 5 : sprint boosté de l'ailier)
```

- Tick fixe à 30 Hz (`TICK_RATE`, `TICK_DT`). `dt` existe pour la forme de l'API mais doit valoir `TICK_DT`.
- `step` est **déterministe** : même état + mêmes entrées => même état, octet pour octet (comparaison via `JSON.stringify`).
  - Itération des joueurs toujours dans l'ordre des ids.
  - Aucun `Math.random`, `Date`, `performance`, aucun état global mutable caché : tout l'état vit dans `MatchState`.
  - Tout aléatoire via `src/sim/prng.ts` sur `state.rng`.
- Toutes les minuteries de l'état sont des **entiers en ticks**. Les constantes sont exprimées en secondes et converties par `secToTicks`.
  Les cooldowns sont fixés au moment où l'action est déclenchée (multiplier par `LAST_MINUTE_COOLDOWN_MULT` si `state.lastMinute`).
- `state.events` est vidé au début de chaque `step` et contient les événements du tick (sons, FX, HUD).
- Ids : joueurs `0..2*teamSize-1`. Équipe 0 = ids `0..teamSize-1`, équipe 1 = la suite. En solo, le client contrôle le joueur 0.
- Une entrée manquante pour un joueur = entrée neutre qui conserve son yaw/pitch courant. Elle ne met pas à jour
  `lastButtons` : un bouton encore maintenu au tick suivant ne crée pas de faux front montant (pas de double saut).
- `state.config` est la configuration **normalisée** (`Required<MatchConfig>`) : tous les champs sont renseignés.
- Les entrées sont **assainies** par la sim (valeurs non finies ignorées, déplacement borné à [-1, 1] puis normalisé
  si sa norme dépasse 1, bits inconnus retirés) : aucune entrée (client, bot, réseau) ne peut injecter de NaN dans l'état.
- `dt` différent de `TICK_DT` => exception (le déterminisme repose sur le pas fixe).
- Pas de `-0` créé dans l'état statique (il deviendrait `0` après un aller-retour JSON) : on écrit `0 - v` plutôt
  que `-v` (formation, miroir du terrain, normale du sol) et un test le vérifie sur `createMatch`. Le test
  d'aller-retour vérifie que le résultat d'un `step` ne dépend jamais de ce genre de détail.

Ordre des opérations dans `step` (à respecter et documenter dans `match.ts`) :

1. `events = []`, `tick++`.
2. Phase : décompte `kickoff` -> `play` ; décompte `try` -> remise en jeu.
3. Pour chaque joueur (ordre des ids) : lecture de l'entrée, fronts montants (`buttons & ~lastButtons`), yaw/pitch (pitch borné).
   En `kickoff`/`try`/`ended` : seule la visée est appliquée (joueurs figés).
4. Minuteries (cooldowns ; statut down/getting_up, rechargement, délai de régénération ; durée / cooldown des capacités).
5. Actions : capacité, actions du porteur (passe, coup de pied), tir (création de projectiles ; le porteur du DÉBUT du tick
   n'utilise pas son arme, même s'il vient de passer / taper le ballon).
6. Projectiles : déplacement balayé, collisions joueurs / boucliers / terrain -> dégâts, explosions, knockback (`projectiles.ts`),
   **avant le déplacement** (capsules au début du tick, là où le tireur les voyait, §10) ; puis décompte de l'invulnérabilité
   (`tickInvulnerability` : les projectiles voient la valeur du tick précédent).
7. Déplacement : esquive / glissade / plongeon / saut / course, gravité, terrain (marche, grimpe), murs invisibles, séparation entre joueurs.
8. Stabilité : plaquages (statut down, lâcher du ballon), régénération (`stability.ts`).
9. Ballon : suit le porteur, ou physique (gravité, rebonds seedés, frottement), puis ramassage / réception / interception
   (`updateBallPickup(state, from, fromMode)` reçoit la position et le mode du ballon AVANT sa physique : test balayé).
10. Zones (ralentissement), mêlée.
11. Règles : essai, chrono, dernière minute, fin de match.
12. `lastButtons = buttons` (sauf entrée manquante).

## 3. Repère, angles, visée

Voir l'en-tête de `src/sim/vec.ts`.
- Y vers le haut, terrain dans le plan XZ. L'équipe 0 attaque vers **+Z**, l'équipe 1 vers **-Z**.
- `forward(yaw) = (sin yaw, 0, cos yaw)`, `right(yaw) = (-cos yaw, 0, sin yaw)`. Souris vers la droite => yaw diminue.
- **Origine de visée** = pieds + `AIM_ORIGIN_HEIGHT` vers le haut + `SHOULDER_OFFSET` vers `right(yaw)` (`aimOrigin`, défini dans
  `playerStatus.ts`, ré-exporté par `player.ts` et l'API publique). Elle ne dépend pas de la posture : c'est pourquoi on ne tire
  pas en posture basse (glissade, plongeon, §10).
  Les tirs partent de ce point selon `aimDir(yaw, pitch)`. La caméra épaule se place sur la MÊME droite, en arrière :
  `camPos = aimOrigin - aimDir * distance`. Le tir part donc exactement vers le réticule, à toute distance, sans que la sim
  connaisse la caméra. (Si la caméra est rapprochée par une collision, elle reste sur cette droite.)

## 4. Interprétations du cahier des charges (décisions)

- **Shift** : appui = esquive (bouton `DODGE`), maintien = sprint (`SPRINT`), comme « tap to dodge / hold to sprint ».
  Par défaut (`KEYBOARD_DODGE_ON_RELEASE = true`, décision de l'étape 3), le client émet `DODGE` au **relâchement** d'un
  appui plus bref que `SPRINT_HOLD_DELAY_SEC`, et `SPRINT` tant que la touche est maintenue au-delà : maintenir Shift
  sprinte **sans consommer l'esquive** (comme B et L3 séparés à la manette). Latence de l'esquive = durée du tape.
  Avec `false` : `DODGE` au front d'appui (latence nulle), mais chaque sprint commence par une esquive.
  Sprint : uniquement en avançant ; annulé par la visée (sauf pour le porteur, qui ne vise pas) ; **le tir l'emporte**
  (étape 5) : FIRE maintenu avec une arme prête => le sprint est ignoré ce tick (`fireOverridesSprint`, §10).
- **Le porteur ne vise pas** : la sim ignore `AIM` pour lui (pas de `AIM_SPEED_MULT`, sprint non annulé) ; côté client,
  la visée ne rapproche pas sa caméra, ne change pas les sensibilités et ne coupe pas le sprint L3.
- **Glissade** : touche **C** en courant (`SLIDE`). Pour le porteur, **C = plongeon**.
- **Touches** : on lit `KeyboardEvent.code` (position physique) pour que ZQSD/A sur AZERTY = WASD/Q sur QWERTY.
  Défaut : avancer `KeyW`(Z), gauche `KeyA`(Q), reculer `KeyS`, droite `KeyD`, saut `Space`, esquive/sprint `ShiftLeft`,
  glissade/plongeon `KeyC`, passe `KeyE`, coup de pied `KeyF`, capacité `KeyQ`(A), tir clic gauche, visée clic droit,
  rechargement `KeyR` (bouton `RELOAD`). Jamais de Ctrl (Ctrl+W ferme l'onglet).
- **Manette** (Gamepad API, disposition « standard » Xbox/PlayStation), mapping par défaut :
  | Contrôle | Action |
  |---|---|
  | Stick gauche | déplacement (zone morte radiale `GAMEPAD_MOVE_DEADZONE`) |
  | Clic stick gauche (L3) | sprint (bascule ; s'annule quand le stick revient au centre ou en visée — sauf porteur ; le tir ne l'annule pas : la sim ignore le sprint tant que l'arme tire, comme Maj au clavier, §10) |
  | Stick droit | caméra (courbe `GAMEPAD_LOOK_CURVE`, vitesses `GAMEPAD_LOOK_*`, boost en bout de course) |
  | A / Croix | saut |
  | B / Rond | esquive |
  | X / Carré | glissade ; plongeon pour le porteur |
  | Y / Triangle | coup de pied (porteur) + rechargement (les deux bits sont émis ; la sim ignore celui qui ne s'applique pas) |
  | RB / R1 | passe (porteur) |
  | LB / L1 | capacité |
  | RT / R2 | tir |
  | LT / L2 | visée |
  | Start / Options | pause |
  Clavier/souris et manette sont fusionnés en un seul `PlayerInput` (boutons en OU, yaw/pitch communs) ; le « périphérique actif »
  (dernier utilisé) pilote les aides affichées (glyphes) et la pause (avec la manette, perdre le pointer lock ne met pas en pause).
  Aide à la visée manette côté client uniquement (`AIM_ASSIST_*` : ralentissement près d'un adversaire + léger suivi) — elle ne fait
  que produire yaw/pitch, la sim n'en sait rien. Vibrations sur les événements du joueur local (`GAMEPAD_RUMBLE`).
- **Cône de passe** : relatif au **terrain** (règle du rugby : uniquement vers son propre en-but), demi-angle 90° = 180°.
  La visée assistée choisit le coéquipier du cône le mieux noté : alignement avec le regard (regarder à gauche => passe à gauche),
  distance proche de `PASS_IDEAL_RANGE`, démarquage. Aucun coéquipier valide => pas de passe, événement `pass_denied`.
- **Passe** : en cloche vers la position anticipée du receveur, jamais en avant ; le receveur visé, ou un adversaire qui
  traverse la trajectoire (interception), attrape le ballon — pas un autre coéquipier. Le passeur ne peut pas rattraper
  pendant `PASS_PICKUP_BLOCK_SEC`.
  Détails et décisions de l'étape 4 : §9.
- **Essai** : le porteur franchit la ligne d'essai adverse (pas besoin d'aplatir). Le plongeon sert à franchir les derniers mètres invulnérable.
- **Remise en jeu** : l'équipe qui a encaissé est placée `KICKOFF_RECEIVE_OFFSET` devant sa ligne d'essai, ballon donné au joueur le plus central ;
  l'autre équipe derrière la médiane (`KICKOFF_DEFEND_OFFSET`). Joueurs figés `KICKOFF_FREEZE_SEC`. Coup d'envoi initial : `FIRST_KICKOFF_TEAM`.
- **Fin du match** : à 0 au chrono, immédiatement. Égalité possible.
- **Armes** : toutes à projectiles (rapides pour SMG/pompe, balistiques pour grenades). Visibles, esquivables, déterministes.
  Pas de tir ami. Le porteur ne tire pas. Au sol, en glissade, en plongeon, en grimpe, bouclier levé (étape 7) : pas de tir.
  Le sprint n'empêche pas de tirer : tirer coupe le sprint (§10).
- **Stabilité** : `stabilityMax` par rôle (100 par défaut). Jauge vide => `down` `DOWN_DURATION_SEC`, ballon lâché (petit rebond),
  puis `getting_up` (`GETUP_DURATION_SEC`) puis invulnérabilité `GETUP_INVULN_SEC`. Sur place, pas de respawn.
- **Mêlée** : ballon `loose` depuis `SCRUM_LOOSE_SEC` avec ≥ N joueurs actifs de chaque camp dans `SCRUM_RADIUS` (×échelle) => ballon `scrum`
  bloqué au centre, zone de capture `SCRUM_CAPTURE_SEC` ; l'équipe la plus nombreuse dans la zone gagne, ballon donné à son joueur le plus proche.
  Égalité : prolongation `SCRUM_TIE_EXTRA_SEC`, puis tirage au sort seedé.
- **Dernière minute** : `LAST_MINUTE_COOLDOWN_MULT` sur les cooldowns, `LAST_MINUTE_BALL_SPEED_MULT` sur passes / coups de pied.
- **Bots** : la difficulté (`BOT_DIFFICULTY`) règle temps de réaction, erreur de visée, vitesse de rotation. Leur aléatoire passe par
  leur propre PRNG seedé (dérivé de la seed du match et de leur id), stocké dans leur mémoire interne (pas dans MatchState).
- **Mode entraînement** (`config.training`) : chrono figé, pas de fin de match — pour régler le feeling du porteur.

## 5. Rendu

- `render/` ne lit que des `MatchState` et des événements. Interpolation entre l'état précédent et l'état courant avec
  `alpha = accumulateur / TICK_DT` (positions lerp, angles via `lerpAngle`).
- Le yaw/pitch de la caméra du joueur local utilise la valeur souris courante (pas interpolée) pour une visée réactive.
- Style flat coloré : `MeshLambertMaterial`/`MeshToonMaterial`, couleurs saturées, équipe 0 orange, équipe 1 bleu.
- Placeholders géométriques uniquement (capsules, ellipsoïde, boîtes), pas d'assets externes.
- Le marqueur du porteur est rendu sans test de profondeur (visible à travers le relief).
- Les valeurs purement visuelles (couleurs, épaisseurs de contour, durée de la traînée…) sont dans `render/palette.ts` ;
  tout ce qui touche au feeling (caméra, sensibilités, manette, vibrations) reste dans `src/sim/constants.ts`.

## 6. Vérification

- `npm run typecheck` : tsc sur sim+bots sans DOM, puis svelte-check sur tout le projet.
- `npm test` : vitest (déterminisme, physique, règles, bots, architecture).
- `npm run build` : build statique dans `dist/`.
- `npm run check` : les trois.

## 7. Module de simulation (étape 2)

| Fichier | Rôle |
|---|---|
| `match.ts` | `createMatch` (validation + normalisation de la config, joueurs, formation, ballon), `step` (ordre §2). |
| `input.ts` | `NEUTRAL_INPUT`, `makeInput`, lecture/assainissement d'une entrée pour un tick (`TickInput`, transitoire). |
| `player.ts` | Vitesse des joueurs : course, sprint, visée, esquive, glissade, saut (coyote, tampon, double saut), minuteries. |
| `body.ts` | Intégration contre le terrain (sous-pas, marche, grimpe, obstacles), gravité, murs invisibles, séparation. |
| `ball.ts` | Ballon porté / physique (gravité, traînée, rebonds seedés, roulement, murs, faces de murets). |
| `field.ts` | Terrain : `createField`, `groundHeight`, `supportHeight`, `groundGradient`/`groundNormal`, `faceContact`. |
| `formation.ts` | Placement des équipes (début de match, remises en jeu de l'étape 6). |
| `serialize.ts` | `cloneState`, `hashState`. |
| `carrier.ts` | **Étape 4** : passe, coup de pied, plongeon (`tryStartDive`, appelé quand le porteur presse SLIDE), ramassage, réception (§9). |
| `playerStatus.ts` | `aimOrigin`, `isCarrier`, `playerHeight`, `cooldownTicks` (partagés par player.ts, carrier.ts et combat.ts sans import circulaire ; ré-exportés par player.ts). |
| `combat.ts` | **Étape 5** : statut down/getting_up, rechargement, tir (cadence, dispersion seedée, projectiles), `canShoot`, `fireOverridesSprint` (§10). |
| `projectiles.ts` | **Étape 5** : déplacement balayé des projectiles, collisions capsules / relief, points d'extension bouclier et grenade (§10). |
| `stability.ts` | **Étape 5** : dégâts (atténuation, porteur), plaquage, lâcher du ballon, régénération (§10). |
| `raycast.ts` | **Étape 5** : intersections segment / capsule et segment / relief (exactes ; buttes échantillonnées). |
| `rules.ts` | Décompte kickoff -> play ; **étape 6** (vide) : essai, remise en jeu, chrono, fin. |
| `abilities.ts` | **Étape 5** : sprint boosté de l'ailier (durée, cooldown, multiplicateurs) ; **étape 7** : bouclier, zones. |
| `scrum.ts` | **Étape 7** (vide) : mêlée. |

Décisions prises à l'étape 2 :

- **Terrain** : disposition FIXE (`FIELD_FEATURES_HALF_5V5`, moitié z < 0) recopiée par rotation de 180° (équité).
  3v3 : positions et tailles horizontales ×`FIELD_SCALE_3V3`, hauteurs inchangées. Rien dans les en-buts, ni à moins de
  `FIELD_TRY_LINE_CLEARANCE` des lignes d'essai, ni dans le couloir central (`FIELD_CENTER_CLEARANCE`) ; les positions de
  formation / remise en jeu sont sur du plat (tests). Repère local d'un relief : axe +Z = `(sin r, 0, cos r)`, axe +X = `(cos r, 0, -sin r)`.
- **Hauteurs** : `groundHeight` = sol ponctuel (ballon, rendu) ; `supportHeight(r)` = sol sous un disque de rayon r
  (empreintes de murets/rampes élargies, buttes échantillonnées au centre) pour les joueurs.
  `groundNormal` est calculée **analytiquement** (gradient exact du relief dominant) plutôt que par différences finies :
  pas d'artefact au bord des faces verticales ; un test la compare au gradient numérique.
- **Joueurs** : montée automatique ≤ `MAX_STEP_HEIGHT` ; au-delà et jusqu'à `MAX_CLIMB_HEIGHT`, grimpe (`move = 'climb'`) à
  `CLIMB_UP_SPEED` en gardant `CLIMB_HORIZONTAL_KEEP` de l'élan (sans arrêt : à grande vitesse, c'est un saut par-dessus),
  **seulement si l'on va vers la face** (cos ≥ `CLIMB_MIN_APPROACH`) ; un muret frôlé (course parallèle) fait obstacle.
  Au-delà de `MAX_CLIMB_HEIGHT`, obstacle. Obstacle = retour au point de départ du sous-pas, composante de vitesse vers la face
  retirée, puis déplacement vers le point d'arrivée repoussé hors de la face (on longe le muret sans s'y coller).
  Sous-pas ≤ `PLAYER_SUBSTEP_MAX_DIST` (pas de traversée en esquive).
  Verticale intégrée exactement (parabole) : hauteur de saut = v²/2g. Au sol, `vel.y = 0` (pas d'effet tremplin des rampes :
  on retombe simplement du haut).
- **Élan** : au sol, l'excès de vitesse dans la direction voulue (sortie d'esquive, glissade, grimpe, fin de sprint) ne
  diminue qu'à `GROUND_OVERSPEED_DECEL` (le braquage latéral reste à `GROUND_ACCEL`) ; le tick de sortie d'esquive garde
  exactement `DODGE_SPEED × DODGE_EXIT_SPEED_KEEP`. En l'air, maintenir la direction ne freine jamais : au-delà de la vitesse
  cible, l'entrée ne fait que réorienter la vitesse (norme conservée).
- **Cooldowns** fixés au déclenchement (glissade comprise : le cooldown court pendant la glissade).
  Esquive possible depuis la course ou la glissade, pas pendant une grimpe. Saut possible depuis la glissade (garde l'élan).
  Pendant une esquive au sol, un saut est possible après `DODGE_JUMP_CANCEL_SEC` (« dash-saut » : l'esquive s'arrête avec la
  vitesse de sortie) ; un appui plus tôt reste dans le tampon de saut (B puis A à la manette n'est jamais perdu).
- **Ballon** : une passe ou un coup de pied qui touche le sol devient `loose`. Rebond si la vitesse d'impact dépasse
  `BALL_MIN_BOUNCE_SPEED` (4 tirages `state.rng` : restitution, déviation, culbute, vrille), sinon roulement. Un ballon
  qui roulait déjà au sous-pas précédent ne rebondit jamais (pied de rampe : il suit le nouveau plan, sans tirage).
  La gravité projetée sur la pente fait descendre les pentes où `BALL_GRAVITY·sin θ > BALL_GROUND_FRICTION` (flancs des
  buttes) ; sur une pente plus douce (rampes), un ballon arrêté reste posé. Prototype : le match démarre en `play`, ballon lâché au centre
  (`BALL_DROP_HEIGHT`, direction tirée au sort) ; l'étape 6 le remplacera par un coup d'envoi.
- **Manette / entrée analogique** : la sim accepte une norme de déplacement < 1 (stick peu incliné) : vitesse cible
  proportionnelle jusqu'à `MOVE_INPUT_FULL_SPEED`, pleine vitesse au-delà. Le sprint sépare **direction** et
  **inclinaison** : direction dans le cône avant (cos ≥ `SPRINT_MIN_FORWARD_COS`, la diagonale clavier à 45° sprinte, le
  pas chassé non) ET stick incliné d'au moins `SPRINT_MIN_TILT` (un stick à peine poussé ne sprinte pas).
  Le dash-saut (`DODGE_JUMP_CANCEL_SEC`) et l'absence de faux front montant sur entrée manquante visent aussi la manette.
  Zones mortes, bascule L3, aide à la visée et vibrations restent côté client (`src/input`, étape 3).

## 8. Client : rendu, entrées, boucle (étape 3)

| Fichier | Rôle |
|---|---|
| `input/keymap.ts` | `Action`, `Keymap` (données : `KeyboardEvent.code` / bouton souris), `DEFAULT_KEYMAP`, libellés AZERTY ou disposition réelle (`navigator.keyboard.getLayoutMap()`). |
| `input/gamepadMap.ts` | `GamepadMap` (données : index de boutons / axes « standard » -> actions, un bouton peut émettre plusieurs actions), glyphes Xbox / PlayStation (`detectGamepadStyle(gamepad.id)`). |
| `input/inputLogic.ts` | Pur : `PressLatch` (appuis brefs verrouillés jusqu'au tick suivant), `TapHoldState` (Shift appui/maintien), fusion des déplacements, `composeInput` (assemblage du `PlayerInput` d'un tick). |
| `input/gamepad.ts` | Pur + état : zones mortes radiales (intérieure + extérieure), courbe, boost, `SprintToggle` (L3), `GamepadInput` (alimenté par un `GamepadLike`, donc testable), `GamepadPicker` (choix de la manette lue), `readGamepads()`. |
| `input/aimAssist.ts` | Pur : aide à la visée manette (ralentissement progressif + suivi borné). |
| `input/haptics.ts` | Table événement -> vibration (`rumbleCueFor`), lecture `dual-rumble` avec priorités, tolère l'absence d'actionneur. |
| `input/InputManager.ts` | Clavier/souris + manette -> un `PlayerInput` par tick (`sample()`), yaw/pitch courants pour la caméra, périphérique actif. |
| `render/Renderer.ts` | Scène, ciel en dégradé, lumières, brouillard, tribunes ; `render(prev, curr, alpha, view, dt, t)`. |
| `render/FieldView.ts` | Sol (bandes de tonte + en-buts teintés par shader en coordonnées monde), lignes, bordure des murs invisibles, reliefs construits depuis `FieldLayout` / `groundHeight`. |
| `render/PlayerView.ts` | Capsules toon + contour, visière, arme, signe de rôle, postures, ombre, anneau humain, losange du porteur (sans test de profondeur). |
| `render/BallView.ts` | Ovale orienté (spin / tumble), traînée en ruban (tampon circulaire), cercle de ramassage, ombre. |
| `render/cameraMath.ts`, `ShoulderCamera.ts` | Caméra épaule (§3) : maths pures testées, lissage distance / FOV. |
| `render/interpolate.ts` | Interpolation positions / angles sans allocation (pas d'interpolation au-delà de `STYLE.teleportDist`). |
| `game/loop.ts` | Pur : `FixedStepLoop` (accumulateur -> ticks par frame, rattrapage borné, alpha). |
| `game/session.ts` | `GameSession` : boucle, entrées, pause, haptique, instantané UI, `inputProviders` (bots). |
| `game/roles.ts` | Composition des équipes (humain = joueur 0 de l'équipe 0). |
| `render/CombatFxView.ts` | **Étape 5** : traceurs, flashs de bouche, étincelles, éclats de plaquage (pools préalloués). |
| `game/combatHud.ts` | **Étape 5** : hitmarker, direction des tirs reçus, vignette (pur, testé). |
| `bots/turret.ts` | **Étape 5** : tourelle d'entraînement (InputProvider pur, PRNG propre), remplacée par les bots de l'étape 6. |
| `bots/aim.ts` | **Étape 5** : visée des bots (`leadAimPoint` : avance sur une cible qui court ; `aimAnglesTo`), pure, réutilisée à l'étape 6. |

Décisions prises à l'étape 3 :

- **Boucle** (`FixedStepLoop`) : accumulateur, au plus 5 ticks par frame (au-delà, retard abandonné), dt de frame borné à 0,25 s.
  `prev = cloneState(state)` avant chaque `step` ; alpha = accumulateur / `TICK_DT`.
- **Entrées des autres joueurs** : `session.inputProviders: Map<id, InputProvider>` avec
  `InputProvider = (state: Readonly<MatchState>, playerId) => PlayerInput` (déclaré dans `src/bots/index.ts` : même contrat
  pour le client et un futur serveur, aucun bot n'a besoin de la session) ; à défaut, entrée neutre qui garde la visée du
  joueur (pas d'entrée manquante : `lastButtons` reste cohérent).
- **Caméra souris** : yaw/pitch accumulés à chaque `mousemove` ; **caméra manette** intégrée à chaque frame (dt de rendu).
  Le `PlayerInput` du tick lit simplement la valeur courante : la sim reçoit exactement l'orientation affichée.
- **Fusion** : boutons en OU ; déplacement = le plus grand des deux (à égalité, périphérique actif) ; yaw/pitch communs.
  Périphérique actif = dernier utilisé (touche, clic, souris > 4 px ; bouton, gâchette, stick au-delà de
  `GAMEPAD_ACTIVITY_THRESHOLD` — distinct de la zone morte : une dérive ne vole pas la main au clavier).
- **Manette lue** (`GamepadPicker`) : la manette « standard » courante tant qu'elle est connectée ; une AUTRE manette standard
  qui montre un geste franc prend la main (manette virtuelle ou seconde manette à l'index 0). Une manette connectée sans
  mapping « standard » est ignorée et l'overlay le signale. Débranchée : plus rien n'est maintenu (visée relâchée).
- **Pause** : pointer lock perdu avec le clavier actif (sauf `?debug`) ; Start à la manette (bascule) ; manette ACTIVE
  débranchée en jeu (sauf `?debug`, le périphérique actif repasse au clavier). En pause, la manette reste interrogée
  (Start / A reprennent) ; à la reprise, tout est relâché et les boutons encore enfoncés sont ignorés jusqu'à leur
  relâchement (le A qui relance la partie ne fait pas sauter). La pause garde l'accumulateur (image figée, pas de recul
  d'un tick) ; la reprise repart de `prev = state`, alpha 0.
- **Caméra** : le port du ballon prime sur la visée (`cameraTargets`). Bonus de FOV lié à la vitesse plafonné à
  `CAMERA_FOV_SPEED_MAX_BONUS`. `SHOULDER_OFFSET` = 0,75 m : la droite de tir passe à 0,30 m du bord de la capsule
  (réticule dégagé de la tête, cibles visibles juste à sa gauche).
- **Postures basses** (glissade, plongeon) : capsule écrasée à `PLAYER_LOW_HEIGHT` (la hitbox de la sim est une
  capsule verticale basse), à peine inclinée (`STYLE.lowPostureLean`) : le corps affiché ne déborde pas de la hitbox.
  (Au sol après un plaquage : capsule couchée, voir §10 ; un joueur au sol est intouchable, aucune hitbox à respecter.)
- **Ballon** : position ET rotation (culbute, vrille) interpolées entre deux ticks.
- **Aide à la visée** : seulement manette active, joueur actif non porteur ; cibles = adversaires `active` dans la portée
  de l'arme, angle mesuré jusqu'à la capsule ; ralentissement continu jusqu'à `AIM_ASSIST_SLOWDOWN` ; suivi =
  `AIM_ASSIST_TRACKING` × déplacement angulaire de la cible (même cible qu'à la frame précédente), seulement si un stick
  est incliné (`AIM_ASSIST_MIN_INPUT`), borné à `AIM_ASSIST_MAX_TRACK_DEG_PER_SEC`.
- **Vibrations** : `GAMEPAD_RUMBLE_EFFECTS` (constantes) ; branché dès maintenant : atterrissage brutal
  (`RUMBLE_HARD_LANDING_SPEED`) ; prêts : tir reçu, plaquage subi / réussi, réception, essai marqué / encaissé.
- **Ballon porté** : `BALL_CARRY_SIDE` porté à 0,5 m (> `PLAYER_RADIUS`) pour que le ballon sorte de la capsule ; l'arme du
  porteur est masquée (il ne tire pas). Le rendu replace le ballon porté avec `carryPosition` (la fonction de `ball.ts`) à
  partir du porteur interpolé (et du yaw courant pour le joueur local).
- **Limite connue (sim, étape 2)** : l'appui d'un joueur sur une rampe / un muret est un disque de rayon `PLAYER_RADIUS`
  (`supportHeight`) ; au bord d'un relief, la capsule peut donc tenir « perchée » jusqu'à 0,45 m au-delà de la face. Un
  rayon de pied plus petit (pour l'appui seulement) est à décider avec la grimpe, pas changé à l'étape 3.
- **Mode debug** (`?debug`) : pas de pause ni d'overlay au démarrage, clavier/clics acceptés sans pointer lock,
  `window.__ovalgun = { session }` (Playwright).

## 9. Le porteur (étape 4)

| Fichier | Rôle |
|---|---|
| `sim/carrier.ts` | Visée assistée (`selectPassTarget`, `passAimDirection`), plan de passe (`planPass`, `ballisticVelocity`), coup de pied (`kickLaunch`, `predictBallLanding`), actions du porteur (`updateCarrierActions`), plongeon (`tryStartDive`, `updateDiveMovement`), ramassage / réception / interception (`updateBallPickup`), outils de test. |
| `sim/combat.ts` | `canShoot` (étape 4 : actif et non porteur ; l'étape 5 complétera). |
| `render/PassIndicatorView.ts` | Indicateurs du porteur local : flèche au-dessus du receveur, chevron au sol pointé vers lui, éventail du cône (vert / rouge), trait au sol, point de chute du coup de pied. |
| `render/FxView.ts` | Anneaux flat des événements (`fxForEvent` pur, table `FX` dans palette.ts), pool préalloué. |
| `game/feedback.ts` | Retours texte temporaires (« Aucun coéquipier derrière », « Interception ! »), table pure. |

Décisions prises à l'étape 4 :

- **Ramassage du ballon libre** (« premier dans le cercle ») : joueur `active`, `pickupBlockTicks == 0`, distance horizontale
  de son AXE au centre du ballon ≤ `BALL_PICKUP_RADIUS`, ballon entre pieds − `BALL_REACH_BELOW` et
  `playerHeight + BALL_CATCH_REACH_ABOVE` (on saute pour un rebond haut ; en glissade / plongeon la portée est plus basse).
  Testé sur la position du ballon en fin de tick (un ballon libre va lentement). Plusieurs candidats : le plus proche, puis
  le plus petit id. `down` / `getting_up` ne ramassent pas.
- **Réception / interception en vol** : si le ballon était en `pass` / `kick` au DÉBUT du tick, test **balayé exact** sur le
  segment parcouru pendant le tick (trinôme horizontal ∩ intervalle de hauteur) contre un cylindre autour de l'axe de
  chaque joueur qui PEUT l'attraper (position de fin de tick) : aucun « tunnel » à 0,9 m/tick. Le premier sur la
  trajectoire l'emporte (plus petit t, puis distance au point d'entrée, puis id). Même si le ballon a touché le sol
  pendant ce tick (il est alors `loose`), le segment en vol compte d'abord ; sinon la règle du cercle s'applique aussitôt.
  Qui peut attraper, et avec quel rayon (`catchRadius`, décision de la correction de l'étape 4) :
  - **passe** : le receveur visé (`ball.passTargetId`) à `PASS_TARGET_CATCH_RADIUS` (1,6 m : la passe assistée pardonne un
    receveur qui ralentit un peu) ; un adversaire du passeur à `PASS_INTERCEPT_RADIUS` (0,8 m : il faut vraiment être sur
    la trajectoire, pas seulement sur le flanc du passeur) ; les AUTRES coéquipiers du passeur jamais (un soutien collé au
    porteur ne vole pas la passe destinée à la cible affichée) ;
  - **coup de pied** : pendant les `secToTicks(KICK_CHARGE_DOWN_SEC)` premiers ticks de vol (`ball.flightTicks`), seul un
    adversaire à moins de `KICK_CHARGE_DOWN_RADIUS` du tireur peut l'attraper (**contre** au contact) — ni un coéquipier
    collé, ni un défenseur à 3 m ; ensuite tout le monde à `BALL_CATCH_RADIUS` ;
  - lanceur inconnu (état forgé, outil de test) : tout le monde à `BALL_CATCH_RADIUS`.
  `catch` porte `fromId` (lanceur) et `intercepted` = **passe** attrapée par un adversaire du passeur. Un coup de pied
  réceptionné par l'adversaire est le jeu normal (pas de vibration / texte « interception », pas de stat).
  Stats : `interceptions` du receveur à chaque interception de passe ; `passes` du passeur à chaque passe RÉUSSIE (reçue par
  un coéquipier) — pas au lancer. `ball.flightTicks` (ticks de vol, 0 hors vol) est tenu par `updateBallPickup`.
- **Visée assistée** : cône relatif au terrain (§4). Le regard est **replié** dans le demi-plan arrière : on garde sa
  composante latérale (X), multipliée par `PASS_AIM_LATERAL_GAIN`, et on remplace sa composante sur l'axe du terrain par
  sa valeur absolue orientée vers son en-but. Regarder à gauche (de son point de vue) => viser à gauche, pour les deux
  équipes ; un petit coup d'œil suffit (le porteur court selon sa caméra : il ne doit pas avoir à la tourner beaucoup).
  Note = `PASS_WEIGHT_AIM`·(1 + cos écart)/2 + `PASS_WEIGHT_DISTANCE`·(pic à `PASS_IDEAL_RANGE`, 0 au contact et à
  `PASS_MAX_RANGE`) + `PASS_WEIGHT_OPENNESS`·openness. openness = **produit** sur les adversaires actifs de (1 − menace),
  menace = 1 − d/`PASS_OPENNESS_RADIUS` (≥ 0), d = distance au segment porteur–receveur ; un adversaire **derrière le
  passeur** par rapport à la direction de la passe (projection < 0) ne menace pas. Avec le max d'origine, un plaqueur au
  contact du porteur donnait la même menace à tous les receveurs et masquait le marquage (la visée choisissait alors le
  receveur marqué) ; le produit garde aussi l'effet de deux menaces distinctes. Égalité : plus petit id. Coéquipier
  exactement à plat : permis.
  **Hystérésis** : la cible retenue au tick précédent (`ball.aimTargetId`, écrite par `updateCarrierActions` à chaque tick
  où le porteur peut agir, remise à −1 à chaque changement de possession) reçoit `PASS_TARGET_STICKY_BONUS`. Le rendu lit
  le même état : sim et affichage restent d'accord, et la cible ne clignote plus entre deux soutiens symétriques au
  moindre pixel de souris. Limite : un soutien exactement à plat (au bord du cône) peut encore apparaître / disparaître
  pour quelques centimètres (le cône reste strict).
- **Passe** : départ à la **poitrine** du porteur (`BALL_CARRY_HEIGHT`), décalé de `PASS_RELEASE_OFFSET` vers le receveur — et
  non de la position du ballon porté (devant-droite) : sinon un défenseur qui fait face au porteur à ~1,5 m interceptait
  toutes les passes sans jamais traverser la trajectoire (trouvé en vérification visuelle, test dédié). Durée de vol T =
  racine positive de |D + `PASS_LEAD`·V·T| = s·T (s = `PASS_SPEED` × dernière minute), bornée à
  [`PASS_MIN_FLIGHT_SEC`, `PASS_MAX_FLIGHT_SEC`] ; V = vitesse horizontale du receveur **plafonnée à `PASS_LEAD_MAX_SPEED`**
  (sa vitesse instantanée pendant une esquive, 21 m/s > `PASS_SPEED`, envoyait le ballon 20 m trop loin) ; point visé =
  position anticipée, `PASS_TARGET_HEIGHT` au-dessus du sol (`supportHeight`).
  **Jamais en avant** : la composante du ballon vers l'en-but adverse ne dépasse pas celle de la vitesse du porteur (0 s'il
  est arrêté ou recule) ; sinon le point visé est ramené sur cette limite. Passe « à plat » permise en course (règle du
  rugby, relative au passeur) ; un receveur qui, derrière, sprinte au-delà de la ligne du passeur arrêté ne reçoit pas une
  passe qui avance de 4 m (il doit « revenir » chercher le ballon, sinon il le manque).
  Limite connue : l'anticipation suppose que le receveur garde sa course. S'il s'arrête net ou coupe à 90° au départ d'une
  passe courte (anticipation ~3 m), il la manque même avec le rayon élargi ; `PASS_LEAD` < 1 corrigerait ce cas mais ferait
  manquer les passes longues aux receveurs qui courent droit (le cas courant). Les bots (étape 6) garderont leur ligne
  quand `ball.passTargetId` les désigne. Vitesse initiale = solution EXACTE de dv/dt = −k·v − g (traînée `BALL_AIR_DRAG`, gravité `BALL_GRAVITY`) :
  l'intégrateur de ball.ts arrive à moins de 3 cm des mains d'un receveur qui court en ligne droite (tests 3v3 / 5v5).
  Passe et coup de pied sur **front montant**, interdits pendant `dive` / `dive_recover` (appui ignoré), permis en course,
  en l'air, en esquive, en glissade, en grimpe. PASS prioritaire : passe partie => KICK du même tick ignoré ; passe refusée
  (`pass_denied`, ballon conservé) => le KICK s'applique.
- **Coup de pied** : départ `KICK_START_FORWARD` devant les pieds, `KICK_START_HEIGHT` au-dessus du sol ; élévation
  `KICK_ELEVATION_DEG` (48° : une chandelle qui passe vite au-dessus des bras) + pitch·`KICK_PITCH_INFLUENCE` bornée ; vitesse
  `KICK_SPEED` × **√`field.scale`** (portée ∝ v², donc proportionnelle à la taille du terrain : ≈ 36 m en 5v5, ≈ 26 m en 3v3
  à l'arrêt, au lieu d'un dégagement systématique dans l'en-but du 3v3) × dernière minute, + `KICK_INHERIT_VELOCITY` × vitesse
  horizontale du tireur. Tireur bloqué `KICK_PICKUP_BLOCK_SEC` (il peut ensuite rattraper son propre coup de pied :
  « chip and chase »). **Contre** : seulement un adversaire à moins de `KICK_CHARGE_DOWN_RADIUS` du tireur pendant
  `KICK_CHARGE_DOWN_SEC` (avant la correction, tout défenseur jusqu'à 4,5 m devant attrapait le coup de pied au départ).
- **Plongeon** (porteur + SLIDE) : depuis `run`, `slide` ou `dodge` (il interrompt l'esquive), pas en grimpe ; en l'air si
  `DIVE_IN_AIR` (vrai : « essai en vol »). Direction : l'entrée de déplacement si elle pointe vers l'avant
  (cos avec le regard ≥ `DIVE_INPUT_MIN_FORWARD_COS`), sinon le regard. Dash `DIVE_SPEED` pendant `secToTicks(DIVE_DURATION_SEC)`
  ticks sans braquage, invulnérable exactement `secToTicks(DIVE_INVULN_SEC)` ticks dès le tick du plongeon, hitbox basse,
  puis `dive_recover` : au sol, freinage `DIVE_RECOVER_DECEL` pendant `DIVE_RECOVER_SEC` (l'entrée est ignorée) ; en l'air, le
  minuteur attend l'atterrissage, sans contrôle (élan gardé). Cooldown `DIVE_COOLDOWN_SEC` (× dernière minute). Ni saut, ni
  esquive, ni passe pendant le plongeon. Une grimpe de muret interrompt le dash (on franchit le muret) mais la
  récupération au sol suit quand même : `startClimb` mémorise `secToTicks(DIVE_RECOVER_SEC)` dans `moveTicks` (inutilisé
  pendant une grimpe) et la fin de grimpe enchaîne sur `dive_recover` (plonger contre un muret n'est pas un dash gratuit).
  Réglage (correction) : `DIVE_SPEED` 17 m/s (dash ≈ 6 m), on sort de la récupération à ~4 m/s : sur 1 s, un plongeon
  couvre un peu plus qu'un sprint de pilier, à peu près autant qu'un sprint d'ailier, en restant un engagement (0,35 s au
  sol, vulnérable après 0,3 s). Le porteur garde le ballon.
- **Recevoir en glissant / en esquivant** : on attrape normalement (joueur actif) ; le mouvement en cours continue jusqu'à
  son terme (glissade : hitbox basse, braquage limité ; esquive : dash). Le nouveau porteur peut enchaîner un plongeon
  depuis la glissade ou l'esquive.
- **Outils de test** : `debugGiveBall(state, id)` (ballon porté immédiatement, sans événement, refusé pour un joueur non
  actif) et `debugResetBall(state)` (ballon libre immobile à `BALL_DROP_HEIGHT` au-dessus du centre, aucun tirage, blocages
  de ramassage levés). Purs et déterministes ; le client les appelle **entre deux ticks** (avant la copie `prev`, donc sans
  traînée interpolée), uniquement en `?debug` ou en entraînement : **G** / **View** (manette) = ballon pour moi, **B** / **croix ↓**
  (manette) = ballon au centre. Ils ne produisent aucun bit `Buttons` (actions `debugGiveBall` / `debugResetBall` de la keymap et du mapping manette).
- **Rendu** : la cible de passe est recalculée à chaque frame avec le yaw COURANT de la caméra. Le receveur étant presque
  toujours derrière le porteur (hors champ de la caméra épaule), l'indicateur principal est un **chevron au sol** au bord de
  l'éventail du cône (entre la caméra et le porteur, donc toujours à l'écran), en plus de la flèche au-dessus du receveur
  (visible quand il est dans le champ) et d'un trait au sol. Éventail vert = cible, rouge = aucune. Point de chute du coup
  de pied : `predictBallLanding` (relief, sans murets), recalé sur la position interpolée du porteur. Tous ces indicateurs
  sont masqués quand la sim ignorerait PASS / KICK (`canCarrierAct`, exporté par la sim : plongeon, récupération au sol) :
  l'écran ne promet jamais une passe qui ne partira pas. Coque blanche pulsante pendant `invulnTicks > 0`. Effets : `Renderer.handleEvents` appelé par la session après chaque step.
- **Vibrations** : réception / ramassage (`catch`), interception réussie (`interceptionMade`), sa passe interceptée
  (`interceptionSuffered`). Un coup de pied réceptionné par l'adversaire n'est pas une interception.

## 10. Tir, projectiles, stabilité et plaquage (étape 5)

| Fichier | Rôle |
|---|---|
| `sim/combat.ts` | `updateStatusTimers` (down -> getting_up -> active, rechargement, délai de régénération), `updateShooting` (rechargement, tir), `canShoot`, `fireOverridesSprint`, `spreadDirection`, `fireIntervalTicks`, `weaponImplemented`. |
| `sim/projectiles.ts` | `updateProjectiles` : segment par tick, premier contact (capsules adverses, relief), dégâts, `projectile_end` ; `shieldBlocks` et `onGrenadeImpact` (points d'extension de l'étape 7). |
| `sim/raycast.ts` | `segmentCapsuleEntry`, `segmentTerrainEntry` (Cyrus-Beck sur murets / rampes, sol plat, murs invisibles, buttes échantillonnées puis affinées par dichotomie). |
| `sim/stability.ts` | `applyDamage`, `damageFalloff`, `damageAmount`, `isHittable`, `updateStability` (plaquage, lâcher, régénération). |
| `sim/abilities.ts` | `tickAbilityTimers`, `updateAbilities`, `endAbility`, multiplicateurs de vitesse / accélération (sprint boosté). |
| `bots/turret.ts` | `createTurret(seed, id, active)`, `turretInput(mem, state, id)`, `createTurretMemory`. |
| `bots/aim.ts` | `leadAimPoint(origin, target, speed, fraction)`, `aimAnglesTo(me, point)` (visée avec avance, partagée avec l'étape 6). |
| `render/CombatFxView.ts` | Traceurs (`inFlightTracer`, `tracerPoint` purs), flashs, étincelles, éclats. |
| `render/PlayerView.ts` | Clignotement, barre de stabilité, posture au sol couchée + étoiles, relevé. |
| `game/combatHud.ts` | Retours de visée du joueur local. |

Décisions prises à l'étape 5 :

- **Cadence** : `fireInterval` est arrondi au tick (au moins 1) : `fireIntervalTicks`. Les minuteries restant des entiers en
  ticks, une cadence fractionnaire (0,075 s = 2,25 ticks) n'est pas représentable sans état flottant ; l'ailier passe donc à
  `2 / TICK_RATE` (15 coups/s, valeur exacte). Tir à t, t + k, t + 2k… tant que FIRE est maintenu (`fireCd`, décompté dans
  `tickPlayerTimers`). **Dernière minute** : `LAST_MINUTE_COOLDOWN_MULT` raccourcit le rechargement et le cooldown de capacité
  (comme esquive, glissade, plongeon) mais PAS la cadence de tir (documenté dans constants.ts).
- **Qui peut tirer** (`canShoot`) : actif, non porteur, ni en glissade, ni en plongeon / récupération, ni en grimpe ; permis en
  saut et en esquive. **Pas de tir en glissade** (correction) : l'origine de visée reste à `AIM_ORIGIN_HEIGHT` (1,6 m) quelle que
  soit la posture, alors que la capsule glissée fait `PLAYER_LOW_HEIGHT` (0,9 m) : on tirait par-dessus un muret de 1,1 m avec
  une hitbox entièrement cachée (≈ 40 % du temps en enchaînant les glissades). Abaisser l'origine aurait obligé la caméra à
  suivre (§3) ; interdire le tir est plus simple et lisible (glisser = esquiver, pas s'abriter pour tirer). Le même prédicat
  autorise le rechargement manuel. **Porteur du début du tick** : `updateShooting` ignore le joueur qui portait le ballon au
  début du tick (`carrierAtStart`), même s'il vient de passer ou de taper : à la manette, Y émet KICK + RELOAD, et le coup de
  pied ne lance plus en plus un rechargement de 1,4 s (ni un tir au tick d'une passe).
- **Tir contre sprint** : si FIRE est maintenu et que l'arme est prête (`canShoot`, arme implémentée, munitions, pas en
  rechargement), le sprint est ignoré ce tick (`fireOverridesSprint`, lu par `targetRunSpeed`) : le tir l'emporte, on ne court
  pas en arrosant. Entre deux balles le sprint reste coupé (pas de vitesse qui « pulse » à 15 Hz) ; pendant un rechargement il
  reprend. La visée (AIM) coupe toujours le sprint. **Une seule règle clavier / manette** (correction) : la bascule L3
  (`SprintToggle`) ne s'annule plus au tir (seulement stick au centre ou visée) ; SPRINT reste émis et la sim coupe le sprint
  exactement comme pour Maj maintenu. Avant, RT annulait la bascule même quand la sim n'aurait pas tiré (rechargement, demi) et
  il fallait recliquer L3 après chaque rafale.
- **Rechargement** : automatique au tir qui vide le chargeur (événement `reload` au même tick), manuel sur front montant RELOAD
  chargeur incomplet (prioritaire sur un tir du même tick). Durée `cooldownTicks(reloadSec)` ; chargeur plein au tick où
  `reloadTicks` revient à 0 (on peut tirer ce tick-là). Un rechargement entamé continue si le joueur est plaqué ou prend le ballon.
- **Dispersion** : chaque projectile part uniformément dans la calotte sphérique de demi-angle `spreadHipDeg` (ou
  `spreadAimDeg` en visée) autour de `aimDir(yaw, pitch)` : 2 tirages `state.rng` par projectile (cos de l'écart, azimut),
  joueurs dans l'ordre des ids. Origine : `aimOrigin` (le tir part vers le réticule, §3). Un tir = `pellets` projectiles et UNE
  munition ; `stats.shotsFired` compte les projectiles (précision = `shotsHit / shotsFired` ≤ 1, plombs compris).
- **Projectiles** : un projectile créé à l'étape 5 de `step` est déplacé dès l'étape 6 du même tick (premier segment depuis
  l'origine). Segment `[pos, pos + vel·dt]` (parabole exacte si `gravity`, grenades de l'étape 7), raccourci au reste de portée.
  Premier contact exact sur le segment (pas de tunnel à 10 m par tick) : capsules des adversaires **touchables** (`isHittable` :
  actifs, `invulnTicks == 0`, jauge > 0) à leur hauteur courante (`playerHeight` : glissade / plongeon = capsule basse),
  élargies de `PROJECTILE_HIT_RADIUS` (balles et plombs ; pas les grenades, à décider à l'étape 7),
  relief (sol plat, murets et rampes exacts, buttes échantillonnées tous les `PROJECTILE_MOUND_SAMPLE_STEP` puis dichotomie),
  murs invisibles **franchis vers l'extérieur** (l'origine de visée d'un joueur collé au bord peut être dehors de 0,3 m : ce mur ne
  l'arrête pas). Plus petit t ; égalité joueur / relief => relief ; égalité entre joueurs => plus petit id. Projectiles traités par id
  croissant (tableau rangé, compactage en place). Fin de vie : impact, bout de portée (`range`), ou `PROJECTILE_MAX_LIFE_SEC` ;
  événement `projectile_end` (raison : `player`, `blocked`, `terrain`, `expired`).
- **Hitbox et image affichée** (correction, constat majeur de la relecture) : les projectiles étaient testés APRÈS le
  déplacement, contre les positions de fin de tick, alors que le client affiche `lerp(prev, curr, alpha)` : la hitbox avait
  (2 − alpha) ticks d'avance sur l'image. Viser le centre d'un porteur qui court en travers à 6 m ratait 46 balles sur 48 ; les
  traceurs passaient « sur » la cible sans toucher. Trois changements : (1) `updateProjectiles` passe **avant le déplacement**
  (étape 6) : positions, posture et invulnérabilité de la fin du tick précédent, c'est-à-dire l'état que le tireur voyait
  (l'invulnérabilité est décomptée juste après les projectiles, `tickInvulnerability`, pour qu'une invulnérabilité de N ticks
  arrête exactement N segments ; une esquive / un plongeon déclenché pendant le déplacement protège donc à partir du tick
  suivant, ce que voient les autres joueurs) ; (2) rayon de balle `PROJECTILE_HIT_RADIUS` (0,15 m) pour le demi-tick
  d'interpolation restant ; (3) balles d'ailier à 300 m/s (10 m par tick : peu d'avance à prendre jusqu'à ~15 m). Mesuré
  (porteur qui sprinte en travers, visée au centre affiché, alpha 0,5) : 47/48 à 3, 6 et 10 m ; à 20 m il faut prendre de
  l'avance (5/48 sans, 47/48 avec) — c'est voulu : des projectiles visibles et esquivables de loin. Test de non-régression
  « cible qui court en travers à 6 m ».
- **Tir collé à l'épaule** : au premier segment (projectile qui part de l'origine de visée), un adversaire dont la capsule
  CONTIENT l'origine n'est touché que si le tir va vers son axe (`startsInsideLeaving`) ; avant, toute balle le touchait, même
  tirée vers le ciel. Les segments suivants gardent la règle « départ dans la capsule = touché à t = 0 » (cible qui s'est
  déplacée sur la balle).
- **Traversés sans effet** : coéquipiers (pas de tir ami), joueurs `down` / `getting_up`, invulnérables (plongeon, fin de relevé),
  et un joueur dont la jauge est déjà tombée à 0 plus tôt dans le même tick (le crédit du plaquage reste au tireur qui l'a vidée).
- **Dégâts** : `damage × damageFalloff(distance parcourue jusqu'à l'impact) × CARRIER_DAMAGE_MULT` si la cible porte le ballon ;
  atténuation 1 jusqu'à `falloffStart`, linéaire jusqu'à `falloffMinMult` à `range`. Point d'extension `shieldBlocks` appelé AVANT les
  dégâts (étape 7 : `blocked`). `applyDamage` : jauge, `regenDelayTicks = secToTicks(REGEN_DELAY_SEC)`, `lastHitBy`, `hit`
  (pos d'impact, montant BRUT, non borné à la jauge restante). `stats.shotsHit` est crédité par `projectiles.ts`, une fois par
  projectile qui touche (pas dans `applyDamage`) : une grenade qui touchera plusieurs joueurs (étape 7) comptera une touche,
  `shotsHit ≤ shotsFired` reste vrai.
- **Régénération** : un coup au tick T => première régénération au tick T + secToTicks(REGEN_DELAY_SEC) (exactement 2 s), puis
  `REGEN_RATE × TICK_DT` par tick jusqu'au max ; joueur actif seulement.
- **Réglage du plaquage** (correction, après le correctif de hitbox qui rend les tirs fiables) : objectif ≈ 1,2–1,3 s de feu
  continu pour plaquer un porteur à un tireur (≈ 0,6 s à deux), priorité au feeling du porteur. Ailier : dégâts 6 -> 5
  (« faible mais précis »), `CARRIER_DAMAGE_MULT` 1,25 -> 1,1 (« un peu plus fort »), balles 150 -> 300 m/s. Porteur ailier
  boosté : `BOOST_SPEED_MULT` 1,3 -> 1,2 (8,8 × 1,22 × 1,08 × 1,2 ≈ 13,9 m/s au lieu de 15,1, contre 10,7 pour un ailier qui
  poursuit au sprint). Temps mesurés (cible immobile, toutes les balles touchent) : 10 m 1,27 s (porteur 1,20 s), 25 m 1,33 s
  (1,27 s), 35 m 1,70 s (1,57 s) ; tableau dans docs/TESTING.md, vérifié par le test « temps pour plaquer ».
- **Plaquage** (étape 8, ordre des ids) : jauge ≤ 0 => `down` pendant secToTicks(DOWN_DURATION_SEC) ticks (compte exact), jauge
  à 0, mouvement spécial annulé (`run`, y compris une grimpe : le corps retombe sur le muret), invulnérabilité et tampon de saut
  remis à 0, capacité terminée (`endAbility` : le cooldown démarre). Le corps glisse : vitesse horizontale plafonnée à
  `TACKLE_SLIDE_MAX_SPEED` au plaquage, puis freinage `TACKLE_SLIDE_DECEL` (≈ 1,2 m au plus) ; aucune action, aucun ramassage,
  exclu de la séparation, et il ne grimpe pas les murets (`body.ts` : seul un joueur actif déclenche une grimpe, un corps au
  sol bute contre la face). Crédit `stats.tackles` au dernier tireur s'il est adverse. Porteur : ballon `loose` à sa position de
  port (`carryPosition`), vitesse horizontale = min(`TACKLE_DROP_CARRY_KEEP` × la sienne, `TACKLE_DROP_MAX_CARRY`) +
  `TACKLE_DROP_POP_FORWARD` dans le sens de course (sa vitesse horizontale, à défaut son regard), verticale `TACKLE_DROP_POP_UP`,
  culbute `TACKLE_DROP_TUMBLE_RATE`, `throwerId` = plaqué, lui seul bloqué `TACKLE_PICKUP_BLOCK_SEC` (les autres peuvent le
  ramasser dès ce tick ; ce blocage est une sécurité, sans effet tant que la durée au sol + relevé est plus longue).
  Événements `tackled` puis `drop`. **Correction** : avant, le ballon gardait TOUTE la vitesse du porteur et le corps n'était pas
  plafonné : plaqué en esquive (21 m/s), le corps glissait 15 m et le ballon partait à 31 m (un coup de pied gratuit vers l'en-but
  adverse) ; il retombe maintenant à 4–5 m, quel que soit le mouvement.
- **Relevé** : `down` -> `getting_up` (secToTicks(GETUP_DURATION_SEC), immobile, intouchable) -> `active` sur place (pas de respawn) :
  jauge pleine, `lastHitBy = -1`, `invulnTicks = secToTicks(GETUP_INVULN_SEC)`, événement `getup`.
- **Sprint boosté (ailier)** : front montant ABILITY, joueur actif, `abilityCd == 0`, capacité inactive => `abilityTicks` =
  secToTicks(duration), événement `ability`. Pendant exactement ces ticks : vitesse de course × `BOOST_SPEED_MULT` (cumulé avec
  sprint et porteur) et accélération au sol × `BOOST_ACCEL_MULT`. Au tick où la durée s'achève, `abilityCd = cooldownTicks(cooldown)`
  (décompté dès le tick suivant : réactivable exactement `cooldown` après la fin). Utilisable en portant le ballon. Pilier / demi :
  ABILITY ignoré sans consommer de cooldown (TODO étape 7). Minuteries dans `tickAbilityTimers` (étape 4, même en phase figée).
- **Points d'extension de l'étape 7** : `weaponImplemented` (le lance-grenades ne tire pas encore : ni munition consommée, ni
  sprint coupé), `onGrenadeImpact` (explosion, knockback), `shieldBlocks` (bouclier frontal), `canShoot` (bouclier levé),
  `abilitySpeedMultiplier` (bouclier, zone de ralentissement), `updateZones`.
- **Tourelles d'entraînement** (`bots/turret.ts`) : contrat `InputProvider` ; immobile, se tourne (au plus `TURRET_TURN_RATE_DEG`)
  vers l'ennemi actif le plus proche à portée (`range × TURRET_ENGAGE_RANGE_MULT`), réagit après `TURRET_REACTION_SEC`, puis
  rafales / pauses ; vise la position prévue de la cible à l'arrivée de la balle (`TURRET_LEAD_FRACTION` de l'avance, `aim.ts` :
  sans avance, une tourelle ne plaquait jamais un porteur qui court) ; erreur de visée par rafale et tremblement par tick tirés
  sur son PRNG propre (`deriveSeed(seed, id)`, dans sa mémoire, jamais dans MatchState) ; suppose un appel par tick. La session les branche sur tous les adversaires
  (`SessionOptions.dummies`, `?dummies=off` => passives). Limite assumée : elles visent l'ennemi le plus proche, souvent un
  coéquipier passif du joueur ; le demi d'en face ne tire pas (grenades : étape 7). L'étape 6 les remplace par de vrais bots.
- **Rendu** : traceurs interpolés sans lecture de l'état précédent (position affichée = `pos − vel·dt·(1 − alpha)`, origine =
  `pos − dir·traveled`) ; un projectile terminé pendant le tick est prolongé jusqu'à son point final (`projectile_end` + position
  dans l'état précédent, passé à `Renderer.handleEvents(events, state, t, prev)`). Plusieurs ticks dans la même frame (≤ 30 i/s,
  à-coup) : les fins des ticks précédents sont dessinées en entier pendant une image, seules celles du dernier tick suivent alpha
  (avant, elles étaient perdues : flash sans traceur). Les traceurs partent visuellement du canon de
  l'arme affichée (`STYLE.muzzle*`) et rejoignent la vraie trajectoire en `STYLE.tracerConvergeDist` : effet cosmétique, la
  collision part de l'origine de visée. Joueur touché : matériau de corps propre à chaque joueur (émissif blanc bref). Barre de
  stabilité face caméra au-dessus des AUTRES joueurs actifs quand la jauge n'est pas pleine (rouge sous
  `STYLE.stabilityBarLowFraction`). Au sol : capsule **couchée face contre terre, vers l'avant** (intouchable, aucune hitbox à
  respecter ; le joueur local tombe loin de sa caméra), orienté selon le lacet AU MOMENT du plaquage (la sim met à jour la visée
  de tous les joueurs, même au sol : le corps couché ne tourne plus avec la souris du plaqué), étoiles qui tournent, puis
  redressement suivant `statusTicks` du relevé ;
  coque d'invulnérabilité aussi pendant `getting_up`. Pools préalloués (traceurs, flashs, étincelles, éclats).
- **Retours de visée** (`combatHud.ts`, valeurs visuelles dans `STYLE`) : hitmarker quand le joueur local touche (plus grand et rouge
  sur un plaquage, non écrasé par une touche simple pendant son affichage ; durée transmise au CSS par `--hm-dur`, pas recopiée),
  indicateurs de direction des tirs reçus (un par tireur,
  angle recalculé à chaque frame avec la caméra et la position COURANTES du tireur), vignette rouge sous
  `STYLE.vignetteFromFraction` de stabilité + flash à chaque tir reçu. Mini-HUD provisoire (stabilité, munitions / rechargement,
  capacité, esquive) dans `App.svelte` ; retours texte « Plaqué ! », « Plaquage ! », « Plaqué ! Ballon lâché ». Vibrations : tir
  reçu (léger), plaquage subi (fort), plaquage réussi (court) — table `GAMEPAD_RUMBLE_EFFECTS`.
