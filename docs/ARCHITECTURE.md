# Ovalgun — Architecture et décisions de conception

Ce document est la référence technique commune. Le cahier des charges d'origine est dans `docs/SPEC.md`.
Langue : identifiants de code en anglais, commentaires et documentation en français.

**Comment le lire.** Les §1 à §6 décrivent l'architecture et le contrat **actuels**. Les §7 à §18 sont le journal des
décisions, étape par étape : une décision reprise plus tard y est signalée sur place (« étape 7 : résolu, §13 », « passe
finale, §17 »…), et en cas de doute la section la plus récente fait foi. Le §19 récapitule la passe finale (documentation,
CI) et le §20 dit comment brancher le mode online.

Sommaire : 1. Vue d'ensemble des modules · 2. Contrat de la simulation · 3. Repère, angles, visée · 4. Interprétations du
cahier des charges · 5. Rendu · 6. Vérification · 7. Simulation (étape 2) · 8. Client (étape 3) · 9. Le porteur (étape 4) ·
10. Tir, stabilité, plaquage (étape 5) · 11. Boucle de match (étape 6) · 12. Bots (étape 6) · 13. Pilier et demi (étape 7) ·
14. Mêlée (étape 7) · 15. Correction de l'étape 7 : rythme · 16. HUD et menus (étape 8) · 17. Passe finale : simulation et
bots · 18. Passe finale : client, caméra et UI · 19. Passe finale : documentation, CI et contrôle final · 20. Brancher le
mode online.

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
  ui/      Svelte 5 (runes) : menu, HUD, pause, fin, contrôles, réglages (étape 8, §16). Logique pure dans ui/logic.
tests/     Vitest (environnement node) : simulation, bots, client (game, input, render, ui), architecture.
.github/   CI (typecheck + tests + build à chaque push / pull request) et déploiement GitHub Pages manuel (§19).
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
hashState(state: MatchState): string                                   // FNV-1a sur JSON.stringify (tests ; même moteur JS seulement, §20)
NEUTRAL_INPUT, makeInput(partial), Buttons, constantes, types…
createField, groundHeight, supportHeight, groundNormal, faceContact      // terrain, partagé avec le rendu
aimOrigin(feet, yaw)                                                    // origine de visée (§3), partagée avec la caméra
carryPosition(feet, yaw, out?)                                          // position du ballon porté, partagée avec le rendu
placeTeamInFormation, formationSlot, placeForKickoff, kickoffDistance,  // placement (coup d'envoi, remises en jeu)
kickoffCarrierIndex
setupKickoff(state, team, freezeSec?), startPlayNow(state), isFrozenPhase // phases (étape 6 ; startPlayNow : OUTIL DE TEST, entre deux step)
attackDir, attackYaw, opponentTeam, ownTryLineZ, opponentTryLineZ,      // lectures PURES de l'état (étape 6 : bots, HUD, tests, §11)
distanceToTryLine, isInOpponentInGoal, isInOwnInGoal, isPlayerActive,
teamPlayers, activePlayers, ballCarrier, possessionTeam, isLive,
ballLandingPoint, clockSeconds, phaseSeconds
selectPassTarget(state, carrierId, yaw) -> PassTarget | null            // visée assistée (PURE : le rendu l'appelle à chaque frame)
passAimDirection(team, yaw), planPass, kickLaunch, predictBallLanding,  // trajectoires du porteur (PURES : rendu, bots)
predictPassCatch(field, pos, vel)                                       // point de réception d'une passe en vol (passe finale, bots)
dodgeSpeed(dir, yaw), maxRunSpeed(state, p)                             // vitesse d'une esquive, plafond de course (passe finale)
ballisticVelocity, ballSpeedMult, backwardZ, canShoot, canCarrierAct
debugGiveBall(state, id), debugResetBall(state)                         // OUTILS DE TEST, entre deux step (?debug / entraînement) ; refusés en 'try' / 'ended' (reset : aussi en 'kickoff')
fireOverridesSprint, fireIntervalTicks, spreadDirection, weaponImplemented // tir (étape 5, PURES : HUD, bots, tests)
damageFalloff, damageAmount, isHittable                                 // dégâts, cible touchable
segmentCapsuleEntry, segmentTerrainEntry                                // intersections balayées des projectiles
abilityActive, abilityImplemented                                       // capacités (étape 5 : sprint boosté de l'ailier)
shieldUp, shieldArcCovers, shieldFacing, segmentShieldEntry, shieldPoint // bouclier du pilier (étape 7, PURES : rendu, bots, §13)
slowZonePlacement, inSlowZone                                           // zone de ralentissement du demi (étape 7)
blastDistance, hasLineOfSight, predictGrenadeImpact                     // explosions / grenades (étape 7)
scrumMinPlayers, scrumRadius, scrumCaptureTicks, scrumMaxTicks,         // mêlée (étape 7, PURES : rendu, HUD, bots, §14)
scrumInOvertime, scrumTicksLeft, scrumLooseReady, countInZone, inScrumZone
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
  Politique réseau conseillée (serveur) : répéter la DERNIÈRE entrée reçue plutôt que l'omettre (§17, préparation au online ; §20).
- `state.config` est la configuration **normalisée** (`Required<MatchConfig>`) : tous les champs sont renseignés.
- Les entrées sont **assainies** par la sim (valeurs non finies ignorées, déplacement borné à [-1, 1] puis normalisé
  si sa norme dépasse 1, bits inconnus retirés, `-0` ramené à `0`) : aucune entrée (client, bot, réseau) ne peut injecter de NaN
  ni de `-0` dans l'état (un bot envoie souvent `direction × 0 = -0`).
- `dt` différent de `TICK_DT` => exception (le déterminisme repose sur le pas fixe).
- Pas de `-0` créé dans l'état statique (il deviendrait `0` après un aller-retour JSON) : on écrit `0 - v` plutôt
  que `-v` (formation, miroir du terrain, normale du sol) et un test le vérifie sur `createMatch`. Le test
  d'aller-retour vérifie que le résultat d'un `step` ne dépend jamais de ce genre de détail.

Ordre des opérations dans `step` (à respecter et documenter dans `match.ts`) :

1. `events = []`, `tick++`.
2. Phase : décompte `kickoff` -> `play` ; décompte `try` -> remise en jeu. En `ended` : seules la visée (étape 3) et
   `lastButtons` (étape 12) sont traitées, puis `step` s'arrête (rien d'autre n'avance, §11).
3. Pour chaque joueur (ordre des ids) : lecture de l'entrée, fronts montants (`buttons & ~lastButtons`), yaw/pitch (pitch borné).
   En `kickoff`/`try`/`ended` : seule la visée est appliquée (joueurs figés).
4. Minuteries (cooldowns ; statut down/getting_up, rechargement, délai de régénération ; durée / cooldown des capacités).
5. Actions : capacité, actions du porteur (passe, coup de pied), tir (création de projectiles ; le porteur du DÉBUT du tick
   n'utilise pas son arme, même s'il vient de passer / taper le ballon).
6. Projectiles : déplacement balayé, collisions joueurs / boucliers / terrain -> dégâts, explosions, knockback (`projectiles.ts`,
   `shield.ts`, `explosion.ts`),
   **avant le déplacement** (capsules au début du tick, là où le tireur les voyait, §10) ; puis décompte de l'invulnérabilité
   (`tickInvulnerability` : les projectiles voient la valeur du tick précédent).
7. Déplacement : esquive / glissade / plongeon / saut / course, gravité, terrain (marche, grimpe), murs invisibles, séparation entre joueurs ;
   puis essai du porteur dont les pieds viennent de franchir la ligne (`updateTryAfterMovement`, AVANT les plaquages de l'étape 8, §11).
8. Stabilité : plaquages (statut down, lâcher du ballon), régénération (`stability.ts`).
9. Ballon : suit le porteur, ou physique (gravité, rebonds seedés, frottement), puis ramassage / réception / interception
   (`updateBallPickup(state, from, fromMode)` reçoit la position et le mode du ballon AVANT sa physique : test balayé).
10. Zones (ralentissement : durée de vie), mêlée (déclenchement sur le ballon libre resté libre après l'étape 9, décompte, résolution, §14).
11. Règles (tick joué : phase `play` après l'étape 2, même si un essai de l'étape 7 l'a passée à `try`) : essai (ballon ramassé / attrapé
    dans l'en-but à l'étape 9), PUIS chrono, dernière minute, fin de match (§11).
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
  Seule exception (passe finale, §18) : le PORTEUR local, qui ne tire pas, a un pivot de caméra monté de
  `CAMERA_CARRY_RAISE` (même direction) ; la montée retombe à exactement 0 quand il n'a plus le ballon.

## 4. Interprétations du cahier des charges (décisions)

- **Shift** : appui = esquive (bouton `DODGE`), maintien = sprint (`SPRINT`), comme « tap to dodge / hold to sprint ».
  Par défaut (`KEYBOARD_DODGE_ON_RELEASE = true`, décision de l'étape 3), le client émet `DODGE` au **relâchement** d'un
  appui plus bref que `SPRINT_HOLD_DELAY_SEC`, et `SPRINT` tant que la touche est maintenue au-delà : maintenir Shift
  sprinte **sans consommer l'esquive** (comme B et L3 séparés à la manette). Latence de l'esquive = durée du tape.
  Avec `false` : `DODGE` au front d'appui (latence nulle), mais chaque sprint commence par une esquive.
  Passe finale (§18, `CARRIER_AUTO_SPRINT`) : le PORTEUR local sprinte automatiquement (SPRINT émis à chaque tick) et
  Maj esquive à l'enfoncement ; les autres joueurs gardent ce comportement.
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
  Plaqué au tick même où ses pieds franchissent la ligne : essai accordé (vérifié après le déplacement, avant les plaquages, §11).
- **Remise en jeu** : l'équipe qui a encaissé est placée `KICKOFF_RECEIVE_OFFSET` devant sa ligne d'essai, ballon donné au receveur désigné
  (`config.kickoffReceivers` : le joueur humain en solo) ou, par défaut, au plus central ; l'autre équipe derrière la médiane
  (`KICKOFF_DEFEND_OFFSET`). Joueurs figés `FIRST_KICKOFF_FREEZE_SEC` au premier coup d'envoi, `KICKOFF_FREEZE_SEC` aux remises en jeu.
  Coup d'envoi initial : `FIRST_KICKOFF_TEAM` (`config.firstKickoffTeam`). Détails et décisions : §11.
- **Fin du match** : à 0 au chrono, immédiatement. Égalité possible. Un essai marqué au tick même où le chrono atteint 0 compte (§11).
- **Armes** : toutes à projectiles (rapides pour SMG/pompe, balistiques pour grenades). Visibles, esquivables, déterministes.
  Pas de tir ami. Le porteur ne tire pas. Au sol, en glissade, en plongeon, en grimpe, bouclier levé (étape 7) : pas de tir
  (bouclier levé : le rechargement reste possible).
  Le sprint n'empêche pas de tirer : tirer coupe le sprint (§10).
- **Stabilité** : `stabilityMax` par rôle (100 par défaut). Jauge vide => `down` `DOWN_DURATION_SEC`, ballon lâché (petit rebond),
  puis `getting_up` (`GETUP_DURATION_SEC`) puis invulnérabilité `GETUP_INVULN_SEC`. Sur place, pas de respawn.
- **Mêlée** : ballon `loose` depuis `SCRUM_LOOSE_SEC` avec ≥ N joueurs actifs de chaque camp dans `SCRUM_RADIUS` (×échelle) => ballon `scrum`
  bloqué au centre, zone de capture `SCRUM_CAPTURE_SEC` ; l'équipe la plus nombreuse dans la zone gagne, ballon donné à son joueur le plus proche.
  Égalité : prolongation `SCRUM_TIE_EXTRA_SEC` en « premier qui mène », puis tirage au sort seedé (à 0 contre 0 : ballon rendu libre).
  Seuls les joueurs actifs comptent (tirer dans la zone pour la vider est voulu). Le chrono tourne. Détails et décisions : §14.
- **Dernière minute** : `LAST_MINUTE_COOLDOWN_MULT` sur les cooldowns, `LAST_MINUTE_BALL_SPEED_MULT` sur passes / coups de pied.
- **Terrain 3v3** (« environ 70 % de la taille du 5v5 ») : 70 % de la **surface**, soit une échelle linéaire `FIELD_SCALE_3V3` = √0,7 ≈ 0,84
  en longueur et en largeur (décision de la correction de l'étape 7, §15 ; avant : 0,7 linéaire, 49 % de la surface, et un porteur qui
  avait passé la défense marquait presque à coup sûr).
- **Bots** : la difficulté (`BOT_DIFFICULTY`) règle temps de réaction, erreur de visée, vitesse de rotation, intervalle de décision,
  portée d'engagement, réflexe d'esquive et avance sur cible. Leur aléatoire passe par leur propre PRNG seedé (dérivé de la seed du
  match et de leur id), stocké dans leur mémoire interne (pas dans MatchState). Détails : §12.
- **Mode entraînement** (`config.training`) : chrono figé, pas de dernière minute ni de fin de match — pour régler le feeling du porteur.
  Tout le reste est identique (coup d'envoi, essais, remises en jeu). Côté client : case « Entraînement » du menu (étape 8), ou
  `?training` (étape 6, gardé pour le debug ; avant, le prototype était toujours en entraînement).

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
- CI (`.github/workflows/ci.yml`, §19) : `npm ci`, `npm run typecheck`, `npm test`, `npm run build` sur Node 22 à chaque push et
  pull request. Déploiement GitHub Pages : `.github/workflows/pages.yml`, manuel (§19, README).

## 7. Module de simulation (étape 2)

| Fichier | Rôle |
|---|---|
| `match.ts` | `createMatch` (validation + normalisation de la config, joueurs, formation, ballon), `step` (ordre §2). |
| `input.ts` | `NEUTRAL_INPUT`, `makeInput`, lecture/assainissement d'une entrée pour un tick (`TickInput`, transitoire). |
| `player.ts` | Vitesse des joueurs : course, sprint, visée, esquive, glissade, saut (coyote, tampon, double saut), minuteries. |
| `body.ts` | Intégration contre le terrain (sous-pas, marche, grimpe, obstacles), gravité, murs invisibles, séparation. |
| `ball.ts` | Ballon porté / physique (gravité, traînée, rebonds seedés, roulement, murs, faces de murets). |
| `field.ts` | Terrain : `createField`, `groundHeight`, `supportHeight`, `groundGradient`/`groundNormal`, `faceContact`. |
| `formation.ts` | Placement des équipes : formation, coup d'envoi / remises en jeu (`placeForKickoff`, étape 6). |
| `serialize.ts` | `cloneState`, `hashState`. |
| `carrier.ts` | **Étape 4** : passe, coup de pied, plongeon (`tryStartDive`, appelé quand le porteur presse SLIDE), ramassage, réception (§9). |
| `playerStatus.ts` | `aimOrigin`, `isCarrier`, `playerHeight`, `cooldownTicks` (partagés par player.ts, carrier.ts et combat.ts sans import circulaire ; ré-exportés par player.ts). |
| `combat.ts` | **Étape 5** : statut down/getting_up, rechargement, tir (cadence, dispersion seedée, projectiles), `canShoot`, `fireOverridesSprint` (§10). |
| `projectiles.ts` | **Étape 5** : déplacement balayé des projectiles, collisions capsules / relief, points d'extension bouclier et grenade (§10). |
| `stability.ts` | **Étape 5** : dégâts (atténuation, porteur), plaquage, lâcher du ballon, régénération (§10). |
| `raycast.ts` | **Étape 5** : intersections segment / capsule et segment / relief (exactes ; buttes échantillonnées). |
| `rules.ts` | **Étape 6** : phases (coup d'envoi, essai, pause, remise en jeu, fin), chrono, dernière minute, `setupKickoff`, `startPlayNow` (§11). |
| `queries.ts` | **Étape 6** : lectures PURES de l'état pour les bots, le HUD et les tests (sens d'attaque, lignes d'essai, joueurs actifs, possession, point de chute, §11). |
| `abilities.ts` | **Étape 5** : sprint boosté de l'ailier (durée, cooldown, multiplicateurs) ; **étape 7** : bouclier (activation, annulation), pose et durée de vie des zones, ralentissement. |
| `shield.ts` | **Étape 7** : géométrie et règles du bouclier frontal du pilier (§13). |
| `explosion.ts` | **Étape 7** : explosions des grenades (dégâts dégressifs, impact direct, ligne de vue, boucliers) et knockback (§13). |
| `scrum.ts` | **Étape 7** : mêlée (déclenchement, décompte, résolution, lectures pures pour le rendu / HUD / bots, §14). |
| `momentum.ts` | **Passe finale** : plafond de course (`maxRunSpeed`) et extinction de l'élan aérien au-delà (`AIR_OVERSPEED_DECEL`), partagés par player.ts et carrier.ts (§17). |

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
  exactement `DODGE_SPEED × DODGE_EXIT_SPEED_KEEP`. En l'air, maintenir la direction ne freine pas : au-delà de la vitesse
  cible, l'entrée ne fait que réorienter la vitesse (norme conservée) — **sauf** l'excès au-delà du plafond de course
  (`maxRunSpeed`), qui s'éteint à `AIR_OVERSPEED_DECEL`, avec ou sans entrée (passe finale, §17 : sinon esquive + sauts à
  répétition allaient plus vite que tout sprint).
- **Cooldowns** fixés au déclenchement (glissade comprise : le cooldown court pendant la glissade).
  Esquive possible depuis la course ou la glissade, pas pendant une grimpe. Saut possible depuis la glissade (garde l'élan).
  Pendant une esquive au sol, un saut est possible après `DODGE_JUMP_CANCEL_SEC` (« dash-saut » : l'esquive s'arrête avec la
  vitesse de sortie) ; un appui plus tôt reste dans le tampon de saut (B puis A à la manette n'est jamais perdu).
- **Ballon** : une passe ou un coup de pied qui touche le sol devient `loose`. Rebond si la vitesse d'impact dépasse
  `BALL_MIN_BOUNCE_SPEED` (4 tirages `state.rng` : restitution, déviation, culbute, vrille), sinon roulement. Un ballon
  qui roulait déjà au sous-pas précédent ne rebondit jamais (pied de rampe : il suit le nouveau plan, sans tirage).
  La gravité projetée sur la pente fait descendre les pentes où `BALL_GRAVITY·sin θ > BALL_GROUND_FRICTION` (flancs des
  buttes) ; sur une pente plus douce (rampes), un ballon arrêté reste posé. Prototype : le match démarrait en `play`, ballon lâché au centre
  (`BALL_DROP_HEIGHT`, direction tirée au sort) ; remplacé à l'étape 6 par un coup d'envoi (§11). Les tests des étapes 2 à 5 gardent ce
  départ grâce au helper `createPlayMatch` (tests/sim/helpers.ts).
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
| `bots/turret.ts` | **Étape 5** : tourelle d'entraînement (InputProvider pur, PRNG propre), remplacée dans le jeu par les bots de l'étape 6 (§12) ; gardée pour ses tests. |
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
- **Pause** : pointer lock perdu avec le clavier actif (sauf `?debug` ; passe finale, §18 : quel que soit le périphérique, et
  aussi perte de focus de la fenêtre et Échap sans pointer lock) ; Start à la manette (bascule) ; manette ACTIVE
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
- **Aide à la visée** : seulement manette active, joueur qui peut tirer (`aimAssistApplies` : `canShoot` — actif, non porteur, ni
  glissade / plongeon / grimpe, ni bouclier levé — et arme en ligne droite, donc pas le lance-grenades du demi : correction de l'étape 7) ;
  cibles = adversaires `active` dans la portée
  de l'arme, angle mesuré jusqu'à la capsule ; ralentissement continu jusqu'à `AIM_ASSIST_SLOWDOWN` ; suivi =
  `AIM_ASSIST_TRACKING` × déplacement angulaire de la cible (même cible qu'à la frame précédente), seulement si un stick
  est incliné (`AIM_ASSIST_MIN_INPUT`), borné à `AIM_ASSIST_MAX_TRACK_DEG_PER_SEC`.
- **Vibrations** : `GAMEPAD_RUMBLE_EFFECTS` (constantes) ; branché dès maintenant : atterrissage brutal
  (`RUMBLE_HARD_LANDING_SPEED`) ; prêts : tir reçu, plaquage subi / réussi, réception, essai marqué / encaissé (branchés aux
  étapes 4 à 6, plus la fin du match à l'étape 6).
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
  manquer les passes longues aux receveurs qui courent droit (le cas courant). Les bots receveurs vont au point de
  réception réel (`predictPassCatch`, passe finale §17 ; « garder sa ligne » à l'étape 6 leur faisait dépasser le ballon). Vitesse initiale = solution EXACTE de dv/dt = −k·v − g (traînée `BALL_AIR_DRAG`, gravité `BALL_GRAVITY`) :
  l'intégrateur de ball.ts arrive à moins de 3 cm des mains d'un receveur qui court en ligne droite (tests 3v3 / 5v5).
  Passe et coup de pied sur **front montant**, interdits pendant `dive` / `dive_recover` (appui ignoré), permis en course,
  en l'air, en esquive, en glissade, en grimpe. PASS prioritaire : passe partie => KICK du même tick ignoré ; passe refusée
  (`pass_denied`, ballon conservé) => le KICK s'applique.
- **Coup de pied** : départ `KICK_START_FORWARD` devant les pieds, `KICK_START_HEIGHT` au-dessus du sol ; élévation
  `KICK_ELEVATION_DEG` (48° : une chandelle qui passe vite au-dessus des bras) + pitch·`KICK_PITCH_INFLUENCE` bornée ; vitesse
  `KICK_SPEED` × **√`field.scale`** (portée ∝ v², donc proportionnelle à la taille du terrain : ≈ 37 m en 5v5, ≈ 31 m en 3v3 (26 m avec l'échelle 3v3 d'avant la correction de l'étape 7)
  à l'arrêt, au lieu d'un dégagement systématique dans l'en-but du 3v3) × dernière minute, + `KICK_INHERIT_VELOCITY` × vitesse
  horizontale du tireur. Tireur bloqué `KICK_PICKUP_BLOCK_SEC` (il peut ensuite rattraper son propre coup de pied :
  « chip and chase »). **Contre** : seulement un adversaire à moins de `KICK_CHARGE_DOWN_RADIUS` du tireur pendant
  `KICK_CHARGE_DOWN_SEC` (avant la correction, tout défenseur jusqu'à 4,5 m devant attrapait le coup de pied au départ).
- **Plongeon** (porteur + SLIDE) : depuis `run`, `slide` ou `dodge` (il interrompt l'esquive), pas en grimpe ; en l'air si
  `DIVE_IN_AIR` (vrai : « essai en vol »). Direction : l'entrée de déplacement si elle pointe vers l'avant
  (cos avec le regard ≥ `DIVE_INPUT_MIN_FORWARD_COS`), sinon le regard. Dash `DIVE_SPEED` pendant `secToTicks(DIVE_DURATION_SEC)`
  ticks sans braquage, invulnérable exactement `secToTicks(DIVE_INVULN_SEC)` ticks dès le tick du plongeon, hitbox basse,
  puis `dive_recover` : au sol, freinage `DIVE_RECOVER_DECEL` pendant `DIVE_RECOVER_SEC` (l'entrée est ignorée) ; en l'air, le
  minuteur attend l'atterrissage, sans contrôle (élan gardé, excès au-delà du plafond de course freiné à
  `AIR_OVERSPEED_DECEL` depuis la passe finale, §17). Cooldown `DIVE_COOLDOWN_SEC` (× dernière minute). Ni saut, ni
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
  l'écran ne promet jamais une passe qui ne partira pas. Coque blanche pulsante pendant `invulnTicks > 0` (passe finale, §18 :
  halo à la couleur claire de l'équipe, faces arrière, pulsation lente). Effets : `Renderer.handleEvents` appelé par la session après chaque step.
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
  (1,27 s), 35 m 1,70 s (1,57 s) ; tableau dans docs/TESTING.md, vérifié par le test « temps pour plaquer ». Repris par le réglage
  du rythme (§15) : `CARRIER_DAMAGE_MULT` 1,3, `SPRINT_SPEED_MULT` 1,12 et `BOOST_SPEED_MULT` 1,1 (porteur boosté ≈ 11,7 m/s ; porteur
  plaqué en 1,00 s à 10 m, 1,07 s à 25 m, 1,30 s à 35 m).
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
  ABILITY ignoré sans consommer de cooldown (étape 5 ; leurs capacités sont arrivées à l'étape 7, §13). Minuteries dans `tickAbilityTimers` (étape 4, même en phase figée).
- **Points d'extension de l'étape 7** (tous branchés à l'étape 7, §13 ; `weaponImplemented` / `abilityImplemented` restent
  exportés et toujours vrais, pour de futures armes) : `weaponImplemented` (à l'étape 5, le lance-grenades ne tirait pas encore : ni munition consommée, ni
  sprint coupé), `onGrenadeImpact` (explosion, knockback), `shieldBlocks` (bouclier frontal), `canShoot` (bouclier levé),
  `abilitySpeedMultiplier` (bouclier, zone de ralentissement), `updateZones`.
- **Tourelles d'entraînement** (`bots/turret.ts`) : contrat `InputProvider` ; immobile, se tourne (au plus `TURRET_TURN_RATE_DEG`)
  vers l'ennemi actif le plus proche à portée (`range × TURRET_ENGAGE_RANGE_MULT`), réagit après `TURRET_REACTION_SEC`, puis
  rafales / pauses ; vise la position prévue de la cible à l'arrivée de la balle (`TURRET_LEAD_FRACTION` de l'avance, `aim.ts` :
  sans avance, une tourelle ne plaquait jamais un porteur qui court) ; erreur de visée par rafale et tremblement par tick tirés
  sur son PRNG propre (`deriveSeed(seed, id)`, dans sa mémoire, jamais dans MatchState) ; suppose un appel par tick. La session les branche sur tous les adversaires
  (`SessionOptions.dummies`, `?dummies=off` => passives). Limite assumée : elles visent l'ennemi le plus proche, souvent un
  coéquipier passif du joueur ; le demi d'en face ne tirait pas (étape 7 : tir en cloche, §13). L'étape 6 les remplace par de vrais bots.
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
  capacité, esquive) dans `App.svelte` (remplacé par le HUD de l'étape 8, §16) ; retours texte « Plaqué ! », « Plaquage ! », « Plaqué ! Ballon lâché ». Vibrations : tir
  reçu (léger), plaquage subi (fort), plaquage réussi (court) — table `GAMEPAD_RUMBLE_EFFECTS`.

## 11. Étape 6 : boucle de match complète (1re partie : simulation et HUD minimal)

| Fichier | Rôle |
|---|---|
| `sim/rules.ts` | `updatePhase` (étape 2 : décomptes `kickoff` -> `play`, `try` -> remise en jeu), `updateRules` (étape 11 : essai, chrono, dernière minute, fin), `setupKickoff` (placement + remise à zéro), `startPlayNow`, `isFrozenPhase`. |
| `sim/formation.ts` | `placeForKickoff`, `kickoffDistance`, `kickoffCarrierIndex`. |
| `sim/queries.ts` | Lectures PURES pour les bots / le HUD (tableau ci-dessous). |
| `sim/match.ts` | `createMatch` démarre en `kickoff` ; `step` s'arrête après la visée en `ended`. |
| `game/matchHud.ts` | HUD de match PUR (testé) : chrono `m:ss`, « 3, 2, 1, JOUEZ ! », bannière d'essai, dernière minute, écran de fin (stats). |
| `game/session.ts` | Événements -> `MatchHud`, caméra retournée à chaque remise en jeu, fin (pointer lock relâché sans pause), `restart()`, `installProviders()`. |
| `ui/App.svelte` | Score / chrono en haut, compte à rebours, bannières, écran de fin (bouton « Rejouer », Entrée, A) ; répartis en composants à l'étape 8 (§16). |

Décisions :

- **Cycle des phases** : `createMatch` -> `kickoff` (`setupKickoff(config.firstKickoffTeam)`) -> `play` -> essai -> `try`
  (`TRY_PAUSE_SEC`) -> `kickoff` reçu par l'équipe qui a encaissé -> `play`… ; chrono à 0 -> `ended` (définitif).
  Durées exactes en ticks : un `kickoff` au tick K est suivi de `play` au tick K + secToTicks(`KICKOFF_FREEZE_SEC`)
  (`FIRST_KICKOFF_FREEZE_SEC` pour le premier ; le tick du coup de sifflet est déjà joué : on bouge et le chrono tourne) ; un essai au tick T est suivi de la remise en jeu au tick
  T + secToTicks(`TRY_PAUSE_SEC`). L'événement `kickoff` du premier coup d'envoi est déjà dans `state.events` à la création (le client
  peut le lire avant le premier `step`, qui vide la liste comme d'habitude).
- **Temps figé** (correction de l'étape 6) : premier coup d'envoi `FIRST_KICKOFF_FREEZE_SEC` = 3 s (décompte « 3, 2, 1 » complet, on lit
  le placement), remises en jeu `KICKOFF_FREEZE_SEC` = 2 s (« 2, 1 ») et pause d'essai `TRY_PAUSE_SEC` = 2 s : un essai coûte 4 s figées
  au lieu de 6 (les matchs bots contre bots passaient ≈ 30 % du temps réel figés). `setupKickoff(state, team, freezeSec)` reçoit la durée.
- **Placement** (`placeForKickoff`) : la formation existante (étalée sur `FORMATION_WIDTH_FRACTION` de la largeur) ; équipe qui reçoit à
  `tryLineZ − KICKOFF_RECEIVE_OFFSET × échelle` de la médiane (4 m devant sa ligne), l'autre à `KICKOFF_DEFEND_OFFSET × échelle` derrière
  la médiane dans son camp ; tous orientés vers l'en-but adverse (`attackYaw`). Ces positions sont sur du plat (test 3v3 / 5v5, deux
  équipes). Ballon **porté** par le joueur le plus central de l'équipe qui reçoit (|x| minimal, égalité : plus petit id ; en 3v3 / 5v5,
  celui du milieu). Aucun tirage aléatoire (`rng` intact). **Receveur désigné** (correction de l'étape 6) : `config.kickoffReceivers`
  (`[équipe 0, équipe 1]`, index dans l'équipe, −1 = le plus central, validé par `normalizeConfig`) ; la session y met l'index du
  joueur humain pour son équipe (hors autopilote) : sinon l'humain, toujours à gauche de la formation, ne recevait jamais le ballon.
- **Remise à zéro à chaque remise en jeu** (`setupKickoff`) : mouvement (vitesse, sol, sauts, mouvement spécial) et état transitoire de
  chaque joueur (debout, stabilité pleine, délai de régénération, invulnérabilité, cooldowns d'esquive / glissade / plongeon / tir /
  capacité, capacité inactive, chargeur plein, pas de rechargement, ramassage autorisé, `lastHitBy`), projectiles, zones et mêlée
  (étape 7), ballon (lanceur, cibles, vol, rotations). **Conservés** : score, chrono, `lastMinute`, `tick`, stats, `rng`,
  `nextEntityId` (ids toujours uniques), `lastButtons` (suivi des fronts : un bouton maintenu pendant la remise en jeu ne crée pas de
  faux appui au coup de sifflet). `yaw`/`pitch` sont remis face à l'en-but adverse puis suivent les entrées (aim libre pendant le décompte).
- **Essai** (`checkTry`, appelé juste après le déplacement — étape 7, `updateTryAfterMovement` — puis à l'étape 11) : porteur `active` dont les PIEDS sont dans l'en-but adverse, ligne comprise (`isInOpponentInGoal` :
  équipe 0 z ≥ +tryLineZ, équipe 1 z ≤ −tryLineZ), quel que soit son mouvement (course, glissade, esquive, saut, **plongeon** : on
  aplatit en plongeant). Couvre le ballon ramassé / reçu dans l'en-but adverse : le ramassage (étape 9) précède les règles, donc essai au
  même tick que `pickup` / `catch`. **Plaquage et essai au même tick** (correction de l'étape 6) : le porteur dont les pieds franchissent
  la ligne pendant le déplacement marque AVANT les plaquages de l'étape 8, même si un projectile de l'étape 6 a vidé sa jauge ce tick
  (il tombe ensuite à l'étape 8, après l'événement `try` ; le ballon est déjà mort : pas de `drop`). Plaqué avant d'avoir franchi la
  ligne : pas d'essai, ballon lâché (tests dans les deux sens). Les étapes 8 à 10 du tick d'un essai continuent (ballon mort, inerte) et
  le chrono décompte ce tick (`updateRules(state, played)`). Dans son propre en-but : rien. Effets : `score += TRY_POINTS`, `stats.tries`, événement `try`,
  ballon `dead` posé au sol sous les mains du marqueur (`throwerId` = marqueur), projectiles retirés (rien ne touche pendant la pause),
  `kickoffTeam` = l'équipe qui a encaissé, phase `try`. Pendant la pause : joueurs figés (seule la visée bouge), minuteries qui
  continuent (sans effet : tout est remis à zéro à la remise en jeu).
- **Chrono** : décompté d'un tick à chaque tick joué (phase `play` à l'étape 11), jamais en `kickoff` / `try` / `ended`, jamais en
  entraînement. La mêlée (étape 7) est un mode du ballon pendant `play` : le chrono y tournera. **Ordre de l'étape 11** : essai, puis
  chrono ; un essai au tick où le chrono atteint 0 compte (événements `try` puis `match_end`, score final compris) et la fin l'emporte
  sur la pause d'essai.
- **Dernière minute** : dès que `clockTicks ≤ secToTicks(LAST_MINUTE_SEC)`, `lastMinute = true` et un unique événement `last_minute`.
  Les multiplicateurs existants s'appliquent à partir du tick suivant : `cooldownTicks` (esquive, glissade, plongeon, rechargement,
  capacité — pas la cadence de tir) et `ballSpeedMult` (passes, coups de pied) ; vérifié par un test (cooldown d'esquive, vitesse du
  coup de pied, durée de vol d'une passe).
- **Fin** (chrono à 0) : phase `ended`, événement `match_end` avec le score (égalité possible), ballon `dead` posé au sol, projectiles
  retirés, vitesses des joueurs à 0. Ensuite `step` ne fait plus que `tick++`, la visée et `lastButtons` (test : tout le reste du JSON
  identique après 90 ticks d'entrées quelconques). Outils de test refusés (`debugGiveBall` / `debugResetBall` renvoient faux en `try` et
  `ended` ; `debugResetBall` aussi pendant le décompte : un ballon lâché au centre faisait partir le coup de sifflet ballon libre, sans
  porteur) ; `startPlayNow` n'agit qu'en `kickoff`. Côté client, « Ballon au centre » ne s'affiche que si le reset a eu lieu.
- **Tests** : `createMatch` part désormais d'un coup d'envoi. Les tests des étapes 2 à 5, écrits pour un départ « en jeu, ballon lâché au
  centre », utilisent `createPlayMatch` (tests/sim/helpers.ts) qui reproduit exactement l'ancien état initial (même tirage `rng`) avec les
  règles de l'étape 6 actives. Le test « seeds différentes » compare désormais la trajectoire du ballon (une remise en jeu replace le
  ballon à l'identique quelle que soit la seed). `tests/sim/rules.test.ts` couvre la boucle complète, dont un match entier scripté
  (déterminisme, aller-retour JSON).
- **Lectures pour les bots** (`queries.ts`, PURES, exportées) :
  | Fonction | Rôle |
  |---|---|
  | `attackDir(team)` | +1 (équipe 0) / −1 (équipe 1) : sens d'attaque sur Z (l'opposé de `backwardZ`). |
  | `attackYaw(team)` | Yaw face à l'en-but adverse (0 / π). |
  | `opponentTeam(team)` | L'autre équipe. |
  | `ownTryLineZ`, `opponentTryLineZ(state, team)` | Z de la ligne défendue / attaquée. |
  | `distanceToTryLine(state, team, z)` | Distance à la ligne adverse le long de Z (≤ 0 : dans l'en-but adverse). |
  | `isInOpponentInGoal`, `isInOwnInGoal(state, team, z)` | En-buts, ligne comprise. |
  | `isPlayerActive(p)`, `teamPlayers`, `activePlayers(state, team)` | Joueurs debout ; listes par id croissant (nouveaux tableaux). |
  | `ballCarrier(state)`, `possessionTeam(state)` | Porteur (ou null), équipe en possession (ou −1 ; voir aussi `ball.lastTeam`). |
  | `isLive(state)` | Phase `play` (actions, tirs, chrono). |
  | `ballLandingPoint(state)` | Point de chute (`predictBallLanding` si le ballon vole, sinon sa position au sol). |
  | `clockSeconds`, `phaseSeconds` | Chrono et temps restant de la phase, en secondes. |
  Déjà disponibles : `predictBallLanding`, `selectPassTarget`, `planPass`, `kickLaunch`, `canCarrierAct`, `canShoot`, `isHittable`,
  `backwardZ`, `isFrozenPhase`. Les bots n'agissent utilement qu'en `play` ; pendant `kickoff` / `try`, seule leur visée compte.
- **Client** : vrai match par défaut (`?training` = entraînement, outils de test G / B disponibles comme en `?debug`). HUD minimal
  (`matchHud.ts`, temps passé en paramètre) : score et chrono `m:ss` (arrondi supérieur, rouge clignotant en dernière minute, étiquette
  « DERNIÈRE MINUTE » + bannière `STYLE.lastMinuteBannerSec`), décompte « 3, 2, 1 » (« 2, 1 » aux remises en jeu) avec l'équipe qui reçoit, « JOUEZ ! »
  (`STYLE.playCallSec`), bannière « ESSAI ! » (équipe, marqueur, score) pendant la pause, anneaux dorés `FX.try` sur le marqueur. À chaque
  `kickoff`, la caméra du joueur local est remise face à l'en-but adverse (`attackYaw` ; sinon la sim recevrait l'ancien yaw de la souris).
  **Écran de fin** : VICTOIRE / DÉFAITE / ÉGALITÉ, score final, stats par joueur (essais, plaquages, passes réussies, interceptions,
  précision = touches / projectiles tirés, « — » sans tir), équipe locale d'abord. « Rejouer » : bouton (souris), Entrée / Espace, A à la
  manette, acceptés après `STYLE.endScreenInputDelaySec` (un saut en cours ne relance pas le match). À la fin, le pointer lock est relâché
  SANS mise en pause (ni Start, ni manette débranchée ne mettent en pause l'écran de fin). `restart()` : seed suivante
  (`options.seed + matchIndex`), état, rendu, producteurs d'entrées (`installProviders`), HUD remis à zéro ; au clavier hors `?debug`,
  pause jusqu'au pointer lock demandé par le bouton (l'overlay sert de repli).
- **Vibrations** : essai marqué par son équipe (`try`) / encaissé (`tryConceded`), fin du match (`matchEnd`, la plus prioritaire),
  table `GAMEPAD_RUMBLE_EFFECTS`.
- **Pour l'agent des bots (2e partie de l'étape 6)** : brancher les bots dans `GameSession.installProviders()` (contrat `InputProvider`,
  mémoire et PRNG propres recréés à chaque match). Fait : voir §12 (les tourelles de l'étape 5 ne sont plus installées).


## 12. Étape 6 : bots (2e partie)

| Fichier | Rôle |
|---|---|
| `bots/bot.ts` | `createBot(playerId, difficulty, seed)` -> `InputProvider` ; `botInput(mem, state, id, debug?)` (un tick, orchestration ci-dessous). |
| `bots/memory.ts` | `BotMemory` (sérialisable, hors MatchState) : PRNG propre, situation perçue / en attente, décision, visée lissée, réflexes, blocage. `Situation`, `TacticalRole`, `Decision`. |
| `bots/perception.ts` | Temps de réaction (situation retardée), suivi des tirs reçus (fenêtre « sous le feu », réflexe armé après la réaction). |
| `bots/tactics.ts` | Décision : rôle tactique, point visé, cible de tir (attaque, défense, ballon libre). |
| `bots/carrierBrain.ts` | Porteur : direction de course échantillonnée, passe (via `selectPassTarget`), coup de pied (via `kickLaunch` + `predictBallLanding`), plongeon, esquive, sprint boosté. |
| `bots/steering.ts` | Point visé -> direction monde (arrivée, ralentissement, écartement des coéquipiers), détection de blocage (saut + détour). |
| `bots/aiming.ts` | Choix de la cible, erreur de visée lisse, rafales, AIM lointain, rechargement opportuniste. |
| `bots/aim.ts` | (Étape 5) avance sur cible `leadAimPoint`, angles `aimAnglesTo`. |
| `bots/world.ts` | Lectures géométriques communes (bornes du terrain, portée d'engagement, porteur perçu, bots de l'équipe `botsOf`, temps de course `timeTo`…). |

Décisions :

- **Contrat** : un bot est un `InputProvider` comme un humain ; `createBot` enferme une `BotMemory` dans une closure (aucune référence
  au client : il tourne tel quel sur un serveur). Le MatchState n'est QUE lu (test : JSON identique avant / après chaque appel). Un appel
  par tick est supposé ; un tick qui recule (nouveau match) remet la mémoire à zéro. PRNG propre : `deriveSeed(seed, id + 0x5b07)` (le sel
  évite de rejouer la séquence de la tourelle de l'étape 5). Tous les réglages sont dans `constants.ts`, section BOTS (correction de
  l'étape 6 : les derniers nombres en dur de tactics.ts / carrierBrain.ts / steering.ts y ont été déplacés).
- **Joueurs externes** (correction de l'étape 6) : `createBot(id, difficulté, seed, { externalIds })` — les joueurs que ce bot sait NE PAS
  être des bots (l'humain en solo ; un serveur y mettrait tous les humains), gardés dans `BotMemory.externalIds`. La répartition des
  rôles (`botsOf`) se fait entre bots seulement : avant, un humain le plus proche du ballon ou du porteur prenait l'unique place de
  chasseur ou de presseur et ne la tenait pas (68 % du temps de ballon libre sans chasseur bot avec un humain passif). Le client passe
  `[humanId]` (vide en autopilote). Tests : humain immobile près du porteur => un bot presse ; près du ballon => les bots y vont.
- **Perception retardée** : la situation discrète (phase, mode du ballon, porteur, cible de passe, dernière équipe en possession) n'est
  prise en compte qu'après `reactionSec` (± `BOT_REACTION_JITTER`). Le délai court depuis le PREMIER changement ; si la situation change
  encore, c'est la plus récente qui est adoptée à l'échéance (pas de famine quand le ballon change vite de mode). Exception : ce qui concerne
  le bot lui-même (il prend / perd le ballon, une passe lui est destinée) est perçu aussitôt. Les positions sont lues en direct (le délai
  porte sur les DÉCISIONS : pendant la réaction, l'ancienne décision continue, recalculée avec les positions courantes). La même réaction
  s'applique à l'acquisition d'une nouvelle cible de tir et au premier réflexe d'esquive après un tir reçu.
- **Décision** tous les `decisionSec` (± `BOT_DECISION_JITTER`, les bots ne décident pas tous au même tick) ou aussitôt qu'un changement est
  perçu. Chaque bot calcule la répartition de toute son équipe (bots seulement) avec les mêmes règles déterministes (égalités : id
  croissant) et prend sa part : aucune communication, pas de doublon (à la perception près). **Hystérésis** : celui qui tenait déjà un
  rôle classé par distance (pression, repli, chasse) se compte `BOT_ROLE_HYSTERESIS_M` plus près (deux défenseurs à égale distance
  n'échangent plus pression et marquage à chaque décision ; chacun ne connaît que SON rôle précédent : au pire un rôle brièvement doublé).
  **Anticipation** (pression, soutien) avec une vitesse plafonnée à `runSpeed × BOT_LEAD_SPEED_CAP_MULT` (une esquive à 21 m/s faisait
  sauter le point visé de 8 m : demi-tours en série).
  - Attaque : porteur (§ ci-dessous) ; receveur d'une passe en vol : gardait sa ligne (même direction, même sprint) — remplacé à la
    passe finale par une course « juste à temps » vers le point de réception réel (§17) ; les `BOT_SUPPORTERS_3V3/5V5` (1 / 2 ; 2 / 3 depuis le §15) coéquipiers les plus en retrait : soutien à `BOT_SUPPORT_LATERAL` × échelle sur le
    côté et `BOT_SUPPORT_DEPTH` derrière le porteur anticipé (dans son cône de passe ; un soutien seul se met du côté le plus large) ; les
    autres : espace devant (`BOT_SPACE_AHEAD` / `BOT_SPACE_LATERAL` × échelle). Ils ne tirent que sur un défenseur à moins de
    `BOT_ESCORT_THREAT_DIST` du porteur (protection), sinon ils courent sans tirer.
  - Défense : **dernier défenseur** (`cover`) : dès `BOT_COVER_MIN_DEFENDERS` (3 ; 2 depuis le §15) bots actifs, le mieux placé (de préférence déjà devant le
    porteur, armé d'abord) tient TOUJOURS un point entre le porteur et notre en-but (`BOT_COVER_DEPTH` × échelle, au plus
    `BOT_COVER_LINE_FRACTION` de la distance à la ligne) et tire sur le porteur ; avec moins de bots, seulement si personne n'est devant le
    porteur — et alors AVANT la pression (courir derrière un porteur qui sprinte ne sert à rien : sans ce repli, 43–52 % du temps porté se
    passait sans aucun défenseur devant). Puis les `BOT_PRESSERS_3V3/5V5` (2 / 2) plus proches convergent (position anticipée de
    `BOT_PRESS_LEAD_SEC`) et tirent sur le porteur — un seul (`BOT_PRESSERS_OWN_THIRD`) quand le porteur est encore dans son propre tiers
    (`BOT_OWN_THIRD_FRACTION`, typiquement juste après une remise en jeu : l'équipe qui reçoit n'est plus prise en tenaille sur sa ligne).
    Les autres marquent les receveurs par danger décroissant (dans le cône de passe, démarqués, proches de notre en-but ; chacun au marqueur
    libre le plus proche), placés `BOT_MARK_GOALSIDE` entre le receveur et notre en-but ; un marqueur tire sur le porteur s'il est à moins de
    `BOT_MARK_SHOOT_CARRIER_DIST`, sur son receveur seulement si celui-ci est une menace directe (à moins de `BOT_ESCORT_THREAT_DIST` du
    porteur), sinon il ne tire pas. Les bots **sans arme utilisable** (demi : grenades à l'étape 7) passaient après les autres pour la
    pression et le repli (pénalité sans effet depuis l'étape 7, supprimée à la passe finale). Marquage stabilisé par une hystérésis à la
    passe finale (§17). Une passe adverse en vol est traitée comme si son receveur portait déjà le ballon.
  - Ballon libre / coup de pied : les `BOT_BALL_CHASERS_3V3/5V5` (2 / 2 ; 1 -> 2 en 3v3) plus proches en temps de course vont au point de
    chute prédit (`ballLandingPoint`), en le traversant (`BOT_CHASE_OVERSHOOT`), jusque contre les murs. **Pas de fusillade** : le chasseur
    sprinte en regardant sa course (tirer couperait le sprint : il courait à 1,02 × runSpeed au lieu de 1,22) et ne tire que si un
    adversaire arrive au ballon au moins `BOT_CHASE_SHOOT_MARGIN_SEC` avant lui ; les autres forment un rideau entre le ballon et leur en-but
    (plus haut si leur équipe vient de taper) et ne tirent que sur l'adversaire qui arrivera le premier au ballon.
  - Phases `kickoff` / `try` / `ended` et joueur au sol : aucun déplacement, regard tourné vers le ballon.
- **Porteur** (`carrierBrain.ts`) : direction choisie parmi `BOT_CARRIER_DIRECTIONS` en éventail (±`BOT_CARRIER_DIR_SPREAD_DEG`), note =
  progression − `BOT_CARRIER_AVOID_WEIGHT` × risque (proximité de sa course projetée aux adversaires projetés selon leur vitesse sur
  `BOT_CARRIER_LOOKAHEAD_SEC`) − sortie du terrain + hystérésis ; évitement × `BOT_LINE_RUSH_AVOID_MULT` près de la ligne (il fonce). Sprint
  si le chemin est libre. **Pressé** (adversaire devant / à côté — jusqu'à `BOT_PRESSURE_BESIDE_TOLERANCE` derrière — à moins de
  `BOT_PRESSURE_RADIUS`, ou sous le feu avec une stabilité basse) : passe arrière vers le receveur démarqué (openness de la sim ≥
  `BOT_PASS_MIN_OPENNESS`) et moins pressé que lui (liberté du porteur = min(distance au plus proche adversaire /
  `BOT_PRESSURE_RADIUS`, stabilité restante) depuis la passe finale, §17). Le receveur est cherché en essayant `BOT_PASS_YAW_SAMPLES` regards avec
  `selectPassTarget` (la visée assistée de la sim, hystérésis comprise) ; le bot tourne ensuite son regard (rotation limitée) et presse
  PASSE au tick où la visée assistée, évaluée avec le regard RÉELLEMENT envoyé, désigne ce receveur : la sim fait partir exactement la passe
  prévue. **Encerclé** (`BOT_ENCIRCLED_COUNT` / `_5V5` adversaires à moins de `BOT_ENCIRCLED_RADIUS`) ou presque plaqué, sans passe : dans
  son propre tiers, passe même peu démarquée (`BOT_PASS_MIN_OPENNESS_OWN_THIRD`) ; sinon **coup de pied** seulement s'il est utile
  (correction de l'étape 6 : 31–49 % des possessions finissaient au pied, rendues à l'adversaire dans 57–70 % des cas) : directions
  écartées si un adversaire passe près de la trajectoire de départ (contre : `KICK_CHARGE_DOWN_RADIUS` + `BOT_KICK_CHARGE_MARGIN` pendant
  `KICK_CHARGE_DOWN_SEC` + `BOT_KICK_CHARGE_EXTRA_SEC`) ou si le point de chute tombe à moins de `BOT_KICK_LAND_MIN_LINE_DIST` × échelle de la
  ligne adverse (un coup de pied dans l'en-but récupéré par l'équipe du botteur était un essai quasi gratuit) ; note = progression +
  `BOT_KICK_ADVANTAGE_WEIGHT` × avance de la première arrivée de son équipe (temps de course, borné par `BOT_KICK_ADVANTAGE_SEC`) ; il ne
  tape que si cette avance dépasse `BOT_KICK_MIN_ADVANTAGE_SEC`, jamais à moins de `BOT_KICK_MIN_LINE_DIST` × échelle de la ligne, jamais
  dans les `BOT_KICK_AFTER_KICK_SEC` qui suivent un coup de pied (pas de « ping-pong ») ; sinon il garde le ballon (course, esquive).
  Réflexes à chaque tick : plongeon d'essai à `BOT_DIVE_TRY_DISTANCE` de la ligne, plongeon d'évasion (sous le feu, stabilité <
  `BOT_DIVE_ESCAPE_STABILITY_FRACTION`, esquive en recharge), esquive (réflexe `dodgeReflex` par seconde sous le feu,
  ×`BOT_CONTACT_REFLEX_MULT` au contact d'un défenseur), perpendiculaire à la menace et côté centre du terrain ; sprint boosté de l'ailier en
  terrain libre. Les boutons d'action sont émis sur UN tick et seulement s'ils n'étaient pas maintenus (`lastButtons` de l'état) : front
  montant garanti.
- **Tir** (`aiming.ts`) : UNIQUEMENT la cible du rôle (`decision.shootId`) si elle est active et à portée (`range × engageRangeMult`) ;
  sinon aucune, le bot regarde où il court (correction de l'étape 6 : le repli sur « l'adversaire le plus proche » faisait tirer tout le
  monde sur tout le monde, 85–91 % des plaquages tombaient sur des non-porteurs et 21–30 % des joueurs étaient au sol). Visée =
  `leadAimPoint` × `leadFraction` + erreur lisse (tirée en écarts-types toutes les `BOT_AIM_ERROR_PERIOD_SEC` + jitter,
  ×`BOT_AIM_PITCH_ERROR_MULT` en pitch, rejointe avec une constante de temps `BOT_AIM_ERROR_SMOOTH_SEC`), convertie en angle selon la
  distance : max(`aimErrorDeg`, atan(`aimErrorM` / distance)) — un décalage latéral en mètres de près (avec des degrés seuls, presque tout
  touchait à 4–8 m : 52–71 % de précision même en facile). Le regard tourne d'au plus `turnRateDeg` × dt ; FIRE seulement si le regard est
  à moins de `BOT_FIRE_CONE_DEG` de la direction voulue (le bot ne connaît pas son erreur) et la cible touchable ; rafales `BOT_BURST_SEC` /
  pauses (`BOT_BURST_PAUSE_SEC` + jitter) × `burstPauseMult` de la difficulté × `BOT_RESTRAINED_PAUSE_MULT` hors pression / repli ; AIM
  au-delà de `BOT_ADS_DISTANCE` ; RELOAD après `BOT_RELOAD_IDLE_SEC` sans cible si le chargeur est sous `BOT_RELOAD_AMMO_FRACTION`. Le demi
  ne tirait pas à l'étape 6 (grenades : étape 7, §13). Le regard sans cible suit la direction de course (le sprint ne s'applique que vers l'avant du regard).
- **Pilotage** (`steering.ts`) : direction monde convertie en entrée locale avec le yaw RÉELLEMENT envoyé (la sim l'applique avant le
  déplacement). Arrivée / ralentissement, répulsion des coéquipiers proches (sauf porteur et receveur ; sous `BOT_IDLE_PUSH_MIN`, un bot
  arrivé ne bouge pas). Murets : le bot fonce dessus (grimpe automatique de la sim). Blocage (veut avancer — inclinaison ≥
  `BOT_STUCK_MIN_MOVE_MAG` —, vitesse < `BOT_STUCK_SPEED` pendant `BOT_STUCK_SEC`) : saut + direction tournée de `BOT_DETOUR_ANGLE_DEG`
  pendant `BOT_DETOUR_SEC`. `maxBlockedTicks` mesure le plus long blocage (tests : < 3 s).
- **Difficulté** (`BOT_DIFFICULTY`, facile / normal / difficile ; resserrée à la correction de l'étape 6 : chaque écart seul donne un petit
  avantage, mais ils se cumulent — le niveau du dessous ne marquait que 15–25 % des points du niveau du dessus) : réaction 0,5 / 0,32 /
  0,22 s ; erreur 5 / 3,5 / 2,5° et 1 / 0,7 / 0,5 m ; rotation 300 / 420 / 600 °/s ; décision 0,5 / 0,4 / 0,3 s ; portée 75 / 85 / 95 % ;
  réflexe d'esquive 0,4 / 0,8 / 1,2 par s ; avance 40 / 80 / 100 % ; pauses entre rafales × 1,3 / 1 / 0,9. Tests : « difficile » bat
  « facile » de plus du double des points (3v3, seeds 4–5) ; normal contre difficile en 3v3 (seeds 4–5), le plus faible marque au moins
  15 % des points du plus fort ; erreur de visée moyenne plus de deux fois plus grande en facile ; réaction plus tardive.
  **Mesure actuelle** (passe finale, après les réglages des §15 et §17 ; chaque niveau des deux côtés, seeds 1 à 6, trois mesures
  indépendantes qui varient selon les seeds) : part des points du plus faible entre niveaux voisins — 3v3 facile / normal ≈ 13–17 %,
  normal / difficile ≈ 17–24 % ; 5v5 facile / normal ≈ 2–11 %, normal / difficile ≈ 9–21 %. Le « au moins 15 % » ne vaut donc que pour le
  cas testé (normal / difficile en 3v3) : les marches sont raides, surtout facile / normal et en 5v5. Sans effet en jeu (la session donne
  la même difficulté aux coéquipiers et aux adversaires) ; piste si un mode « équipes de niveaux différents » apparaît : rapprocher facile
  de normal (`reactionSec` 0,5 -> 0,42, `aimErrorDeg` 5 -> 4,5, `leadFraction` 0,4 -> 0,6) et tester facile / normal.
- **Client** : `GameSession.installProviders()` crée un bot par joueur non humain (coéquipiers ET adversaires) avec `externalIds = [humanId]`,
  difficulté `SessionOptions.difficulty` (défaut `DEFAULT_BOT_DIFFICULTY` = normal ; choix du menu depuis l'étape 8, paramètre
  `?difficulty=facile|normal|difficile` gardé pour le debug, `launch.ts`). `?debug&autopilot` : le joueur 0 est aussi un bot (match bots contre bots vu depuis sa caméra, yaw / pitch interpolés
  du joueur ; aucun joueur externe, receveur des coups d'envoi par défaut). `?dummies=off` : tous les autres joueurs passifs (réglage du
  plaquage). `?size=5` : 5v5 (menu depuis l'étape 8 ; paramètre d'URL gardé pour le debug, `launch.ts`). Les tourelles de l'étape 5 ne sont plus installées (gardées dans `bots/turret.ts` pour
  leurs tests).
- **Mesures** (harnais de relecture, matchs bots contre bots de 6 min, seeds 1 à 4 ; avant -> après correction) :
  | | 3v3 normal | 5v5 normal |
  |---|---|---|
  | Essais par match | 26 -> 33 | 18 -> 16,5 |
  | Ballon porté (part du temps de jeu) | 41 % -> 74 % | 34 % -> 56 % |
  | Joueurs au sol (part du temps-joueur) | 21 % -> 10 % | 25 % -> 12 % |
  | Temps réel figé (décomptes, pauses) | 31 % -> 27 % | 24 % -> 16 % |
  | Coups de pied par match | 43 -> 3,3 | 27 -> 4 |
  | Plaquages par match (dont sur le porteur) | 167 (13 %) -> 75 (64 %) | 326 (9 %) -> 150 (42 %) |
  | Précision des tirs | 73 % -> 58 % | 67 % -> 56 % |
  Facile / difficile : 3v3 ≈ 51 / 30 essais, 5v5 ≈ 27 / 12,5 (mesures de l'étape 6 ; rythme actuel : §15 et §17). Le nombre
  d'essais reste élevé en 3v3 : sur trois joueurs, le demi (désarmé jusqu'à l'étape 7) ne peut ni presser ni couvrir utilement, il reste
  deux tireurs par équipe ; en 5v5 (quatre tireurs sur cinq) le rythme est nettement plus « rugby ». La plupart des essais viennent d'un contre après un plaquage (le ballon repris, l'équipe qui attaquait n'a
  personne derrière). Environ 6 à 10 demi-tours par joueur et par minute hors esquive, surtout aux changements de possession (légitimes).
  ≈ 0,3–0,7 s de calcul par match (sim + bots).
- **Limites connues** : pas d'évitement explicite des murets (on compte sur la grimpe automatique et le détour de blocage) ; le demi ne
  tire pas (étape 7 : résolu, §13) ; la mêlée (étape 7) n'est pas jouée par les bots (un ballon libre longtemps au même endroit reste une course au
  ballon ; étape 7 : résolu, §14) ; les bots ne lisent pas les projectiles (esquive sur tir reçu seulement) ; l'avance d'un coup de pied est estimée au temps de
  course depuis les positions actuelles (sans temps de vol ni réaction) : seuls ≈ 30–40 % des (rares) coups de pied sont récupérés par
  l'équipe du botteur ; la difficulté n'est pas validée contre de vrais joueurs (un humain passif perd 0–270 contre des bots normaux, un
  humain « naïf » qui fonce sans tirer ≈ 20–160).

## 13. Étape 7 (1re partie) : pilier et demi

| Fichier | Rôle |
|---|---|
| `sim/shield.ts` | Bouclier frontal : `shieldUp`, `shieldArcCovers` (arc frontal), `shieldFacing`, `segmentShieldEntry` (surface), `shieldPoint`. PUR. |
| `sim/explosion.ts` | `explode` (dégâts dégressifs, impact direct, ligne de vue, boucliers, self-knockback, une touche créditée), `applyKnockback`, `blastDistance`, `hasLineOfSight`, `blastLosOrigin`. |
| `sim/projectiles.ts` | Parabole exacte balayée en `PROJECTILE_ARC_SUBSTEPS` cordes, boucliers (règles 1 et 2), impact / fin de vie des grenades, `predictGrenadeImpact` (PUR). |
| `sim/abilities.ts` | Bouclier (activation, second appui = annulation à cooldown proportionnel), pose de zone (`slowZonePlacement`), `updateZones`, `inSlowZone`, multiplicateurs de vitesse. |
| `sim/combat.ts` | Toutes les armes tirent (`weaponImplemented` toujours vrai) ; `canShoot` faux bouclier levé, rechargement permis. |
| `game/roles.ts` | `assignRoles` sur les compositions par défaut `TEAM_ROLES_3V3` / `TEAM_ROLES_5V5` (constants.ts), `parseRole` (`?role=`). |
| `bots/roleAbilities.ts` | Bouclier du pilier, zone du demi (décision, regard, appui). |
| `bots/aim.ts`, `bots/aiming.ts` | `ballisticPitch`, `ballisticAimTo` (parabole exacte, arc bas / haut) ; tir en cloche du demi, portée plafonnée du fusil à pompe, pas de tir sur un bouclier qui fait face. |
| `bots/steering.ts`, `bots/carrierBrain.ts`, `bots/tactics.ts` | Contournement des zones adverses (`avoidZones`, pénalité du porteur), demi qui garde ses distances en pression (`standoff`). |
| `render/PlayerView.ts` | Bouclier (arc translucide couleur d'équipe, liseré, flash). |
| `render/CombatFxView.ts` | Grenades (sphère + bande d'équipe + traînée, interpolées sur leur parabole : `grenadePoint`), explosions (boule + onde). |
| `render/ZoneView.ts` | Zones (disque, rideau bas, tirets qui tournent, apparition / fondu) ; aperçus du demi local (pose de zone, impact de grenade). |
| `input/haptics.ts` | `shieldBlock` (léger), `explosionNear` (moyen). |

Décisions :

- **Fusil à pompe** (le générique de l'étape 5 couvre tout : `pellets` projectiles par tir, deux tirages `state.rng` chacun, atténuation
  `falloffStart` -> `range`) : 8 plombs × 6,5 = 52 à bout portant => **plaquage en 2 tirs** (0,83 s, cadence ramenée à 25 ticks, multiple
  exact) jusqu'à ~6 m. Mesuré (40 tirs, cible immobile, hanche / visée) : 52 à 3–5 m, ≈ 38 / 46 à 8 m, ≈ 22 / 35 à 10 m, ≈ 6 / 10 à 15 m,
  rien au-delà de `range` (15 m) : inefficace au-delà de ~12 m. Valeurs inchangées hors cadence.
- **Bouclier : géométrie** (sim ET rendu) : arc de cylindre vertical de rayon `SHIELD_DISTANCE` (0,8 m > 0,6 m de capsule + tolérance) autour
  de l'axe du pilier, sur ±`SHIELD_HALF_ANGLE_DEG` (65°) autour de son yaw, des pieds à `SHIELD_HEIGHT` (2,1 m). `SHIELD_RADIUS` (demi-largeur
  d'un disque plat) est remplacé par `SHIELD_HEIGHT` : un disque plat de 1,1 m à 0,8 m ne couvrait que ±54°. Deux règles :
  1. **surface** : un projectile adverse qui ENTRE dans la surface depuis l'extérieur est détruit (`blocked`, fin `blocked`) — il protège un
     coéquipier **collé dans son dos et dans l'axe du tir** (ce n'est pas un « mur » : à 1,5 m derrière lui, un coéquipier n'est plus couvert dès
     que le tireur est à 45° de l'axe, la ligne de tir passe à côté de l'arc de 0,8 m) ; un tir qui part de l'intérieur du cylindre (collé) ou
     qui la traverse par l'arrière n'est pas arrêté par elle ;
  2. **arc frontal** : le pilier ne subit aucun projectile ni explosion dont la direction horizontale d'arrivée est dans son arc (couvre les tirs
     rasants qui contourneraient le bord de la surface, les tirs collés). Les tirs dans le dos le touchent. Un lob qui arrive par l'avant est
     bloqué aussi (règle 2) ; un lob par-dessus vers un coéquipier derrière n'est pas arrêté par la surface (ouverte en haut).
  Égalités sur une corde : relief, puis bouclier, puis joueur. Un bouclier n'arrête que les projectiles de l'équipe adverse ; il protège même
  un pilier invulnérable ; il n'est levé que par un pilier actif (`shieldUp`).
- **Bouclier : capacité** : front montant ABILITY, capacité prête => `abilityTicks` = durée (3 s), cooldown (10 s) après la durée. **Second
  appui** pendant la durée => bouclier baissé, cooldown **proportionnel** à la durée utilisée (`cooldown × utilisé / durée`, au moins
  `SHIELD_CANCEL_MIN_COOLDOWN_FRACTION` = 0,3 : pas de bouclier « clignotant » gratuit). Plaqué bouclier levé : cooldown complet (`endAbility`).
  Bouclier levé : vitesse de course × `SHIELD_SPEED_MULT` (porteur compris : le pilier qui charge derrière son bouclier), pas de tir (`canShoot`),
  mais le **rechargement** reste possible ; esquive, glissade, saut, plongeon, passe et coup de pied inchangés.
- **Bouclier contre les explosions** : un adversaire du tireur protégé (règle 2 pour le pilier ; règle 1 : TOUTES ses lignes de vue vers
  l'explosion traversent un bouclier levé de son équipe) ne prend **aucun dégât** et un knockback × `SHIELD_BLAST_KNOCKBACK_MULT` (0,35 : le
  pilier encaisse le souffle mais tient sa ligne) ; un événement `blocked` par bouclier et par explosion. Une grenade qui touche un bouclier y
  explose (fin `blocked`).
- **Grenades** : projectile balistique de gravité `gravity` (18 m/s²), vitesse 30 m/s (portée ≈ 50 m à 45°), parabole **exacte** balayée en
  `PROJECTILE_ARC_SUBSTEPS` (4) cordes par tick (extrémités sur la parabole, écart ≤ 0,2 mm ; chaque corde est testée contre relief, boucliers
  et capsules : pas de tunnel). Rayon de collision avec les joueurs = `PROJECTILE_HIT_RADIUS` comme les balles (décision reportée de
  l'étape 5). Explosion à l'impact (relief, mur invisible, joueur adverse, bouclier) ; en **fin de vie** (portée `range` ou
  `PROJECTILE_MAX_LIFE_SEC` : tir très en cloche), explosion en l'air. Le tireur, ses coéquipiers et les joueurs non touchables ne
  déclenchent pas l'impact (ils sont traversés).
- **Explosion** : `d` = distance du centre à la SURFACE de la capsule (point de l'axe le plus proche − `PLAYER_RADIUS`) ; concerné si
  `d ≤ blastRadius`. Dégâts = `blastDamageCenter → blastDamageEdge` linéaire en `u = d / blastRadius`, `+ directHitBonus` pour le joueur
  touché de plein fouet, × `CARRIER_DAMAGE_MULT` pour le porteur. **Ligne de vue** (règle simple et déterministe) : origine = point d'impact
  reculé de `BLAST_LOS_BACKOFF` le long de la trajectoire (côté libre : la corde jusqu'à l'impact est libre de relief ; = centre pour une
  explosion en l'air) ; le joueur est touché si le segment origine -> point de son axe le plus proche, OU origine -> haut de son axe, ne coupe
  aucun relief (`segmentTerrainEntry`) : une butte entre les deux protège, une tête qui dépasse d'un muret non. Une touche créditée au tireur
  par grenade qui blesse au moins un adversaire (`shotsHit ≤ shotsFired`).
- **Knockback** : `(knockback, knockbackUp) × (1 + (knockbackEdgeMult − 1)·u)`, horizontal dans la direction centre -> joueur, réduit
  linéairement à moins de `PLAYER_RADIUS` du centre (explosion sous les pieds : vers le haut). Le souffle horizontal est une **vitesse
  minimale imposée le long de sa direction** (correction de l'étape 7, §15 ; avant, il s'ajoutait à la vitesse du joueur) : avec `n` la
  direction et `a = vitesse·n`, si `a < souffle` la vitesse gagne `(souffle − a)·n` (composante latérale conservée) ; un joueur qui fonce sur
  l'explosion est vraiment renvoyé, un porteur qui fuit déjà plus vite qu'elle ne gagne rien (avant, une grenade tombée derrière un porteur le
  poussait vers l'en-but : 31 à 45 souffles par match 3v3 aidaient le porteur adverse) ; plusieurs explosions au même tick dans la même direction
  ne se cumulent pas. Horizontale plafonnée à `KNOCKBACK_MAX_HORIZONTAL_SPEED` (une vitesse déjà plus haute n'est pas réduite), verticale =
  `max(vy, 0) + souffle` plafonnée à `KNOCKBACK_MAX_VERTICAL_SPEED`. Le joueur quitte le sol
  (pas de saut « coyote » gratuit), **garde son élan en l'air** (règle existante : en l'air, maintenir sa direction ne freine pas ; sans entrée,
  rien ne freine), atterrit normalement ; le déplacement reste balayé en sous-pas (`body.ts`) : **pas de traversée de muret** (test : projeté
  contre un mur haut, il reste de son côté). Esquive, glissade et grimpe interrompues ; plongeon -> récupération (sans contrôle jusqu'au sol).
  Un **porteur projeté garde le ballon**. Le tireur dans son explosion : knockback × `selfKnockbackMult` (0,75), **aucun dégât** (« grenade
  jump » : tiré à ses pieds au début d'un saut, on monte nettement plus haut). **Joueurs au sol, qui se relèvent, invulnérables** : ni dégâts
  ni knockback (un joueur intouchable l'est aussi pour le souffle). Coéquipiers du tireur : rien (pas de tir ami).
  Réglage : 10 m/s + 6 m/s au centre => ≈ 0,45 s en l'air et ≈ 4,5 m de vol plané ; au bord (× 0,35), une petite poussée.
- **Zone de ralentissement** : capacité **instantanée** (`abilityTicks` reste à 0) : le cooldown (12 s) part à la pose, la zone vit
  `ROLES.demi.ability.duration` (5 s, `ttl` exact : elle agit sur le déplacement pendant exactement 150 ticks, retirée à l'étape 10 du dernier).
  Point de pose (`slowZonePlacement`, PUR, partagé avec le rendu et les bots) : rayon de visée depuis `aimOrigin` (longueur
  `SLOW_ZONE_PLACE_RANGE`) contre le relief (et les murs invisibles), reculé de 5 cm (face de muret) puis posé au sol (`groundHeight`) ; sans
  contact, au sol à `SLOW_ZONE_PLACE_RANGE` **horizontalement** devant (`forward(yaw)`) ; centre ramené dans le terrain. **Une zone par demi** :
  la nouvelle remplace l'ancienne (en pratique le cooldown dépasse la durée ; la règle tient si on les règle autrement ou en dernière minute).
  Ids = `nextEntityId` (comme les projectiles), `state.zones` rangé par id croissant. Effet : les **adversaires** dont les pieds sont dedans
  (`inSlowZone` : distance horizontale ≤ rayon, |Δy| ≤ `SLOW_ZONE_HEIGHT`) ont leur **vitesse de course** × `SLOW_ZONE_SPEED_MULT` (sprint,
  visée, porteur compris ; plusieurs zones ne se cumulent pas). **Décisions** : l'accélération ne change pas (l'élan en trop retombe à
  `GROUND_OVERSPEED_DECEL`) ; l'**esquive** et le **plongeon** gardent leur vitesse (s'échapper d'une zone coûte une esquive) ; le saut ne change
  pas ; la glissade devient souvent impossible (vitesse sous `SLIDE_MIN_SPEED`). Aucun effet sur les alliés. Remise à zéro à chaque remise en jeu.
- **Composition des équipes** (`game/roles.ts`) : 3v3 = un de chaque rôle (`TEAM_ROLES_3V3`) ; 5v5 = **1 pilier, 2 ailiers, 2 demis**
  (`TEAM_ROLES_5V5`) : le pilier (le plus lent, portée courte) est un spécialiste du contact — deux piliers ralentiraient tout le jeu et
  laisseraient peu de tireurs à moyenne portée ; deux ailiers donnent des coureurs et du feu précis, deux demis le contrôle de zone (knockback,
  zones) qui manque le plus en 5v5 où les défenses sont nombreuses. Le rôle choisi par l'humain est retiré une fois de la composition et placé
  en tête (index 0, même place de formation) ; l'équipe adverse a la même composition. Client : choix du menu depuis l'étape 8 (défaut ailier) ;
  paramètre `?role=pilier|ailier|demi` gardé pour le debug (`launch.ts`).
- **Bots** :
  - **portées** (`world.ts`, `engageRange`) : fusil à pompe plafonné à `BOT_SHOTGUN_ENGAGE_DIST` (10 m : au-delà, il se rapproche — le rôle
    « pression » le mène au porteur) ; lance-grenades `BOT_GRENADE_ENGAGE_DIST` × `engageRangeMult`, jamais à moins de `BOT_GRENADE_MIN_DIST`
    (son propre souffle). L'ancienne pénalité « désarmé » (demi après les autres pour presser / couvrir) ne s'applique plus.
  - **demi : tir en cloche** (`aiming.ts`) : `ballisticAimTo` (parabole exacte, deux passes pour l'épaule) vers les **pieds** de la cible
    anticipée (`BOT_GRENADE_AIM_HEIGHT` au-dessus du sol, avance = durée de vol × `leadFraction`, vitesse plafonnée), arc bas de préférence.
    Au moment de tirer, l'impact prévu (`predictGrenadeImpact`, relief seulement) doit tomber à moins de `BOT_GRENADE_IMPACT_TOLERANCE` du
    point visé et à plus de `blastRadius + BOT_GRENADE_SELF_MARGIN` de lui, et **aucun adversaire touchable** ne doit se trouver sur les
    premiers mètres de la parabole (jusqu'à `blastRadius + BOT_GRENADE_SELF_MARGIN` de lui, mêmes cordes que la sim, capsules élargies de
    `BOT_GRENADE_PATH_MARGIN` ; correction de l'étape 7 : sans ce contrôle, 7 à 15 grenades par match explosaient sur un adversaire collé au
    demi, en plein dans son propre souffle) ; sinon il essaie l'autre arc (mémorisé : `lobHigh`) et ne tire pas ce tick (le contrôle n'a lieu
    qu'au tick où l'arme est prête : coût négligeable). En pression, il s'arrête à `BOT_GRENADE_STANDOFF` du
    porteur (`standoff`). Pas d'AIM (visée) pour les grenades. **Personne ne tire sur un pilier dont le bouclier lui fait face** (`shieldFacing`).
  - **pilier : bouclier** (`roleAbilities.ts`) : sans ballon, levé sous le feu (réflexe armé) si sa stabilité passe sous
    `BOT_SHIELD_RAISE_STABILITY_FRACTION` face à un tireur hors de portée de son fusil, ou sous `BOT_SHIELD_PANIC_STABILITY_FRACTION` ; il fait
    alors face à la menace (pas de tir) ; baissé (second appui) après `BOT_SHIELD_CALM_SEC` sans menace s'il a une cible à portée de fusil.
    Porteur : levé dès qu'un défenseur armé est devant lui (dans l'arc, à moins de `BOT_SHIELD_CARRIER_DIST`) ou s'il est sous le feu, baissé
    après un moment sans menace. La capacité du porteur n'est pas évaluée pendant une passe / un coup de pied / un plongeon.
  - **demi : zone** : défense — devant le porteur adverse (sa course anticipée de `BOT_ZONE_LEAD_SEC`, + `BOT_ZONE_AHEAD` vers notre en-but),
    s'il n'est pas déjà ralenti ; attaque — sur le poursuivant le plus proche de notre porteur (à moins de `BOT_ZONE_PURSUER_DIST`, derrière ou
    à côté ; le demi porteur se retourne brièvement, seulement si personne ne le presse devant). Point à moins de `BOT_ZONE_MAX_DIST` ; le bot
    vise le sol à ce point et appuie quand `slowZonePlacement` **avec le regard réellement envoyé** tombe à moins de `BOT_ZONE_PLACE_TOLERANCE`
    (abandon après `BOT_ACTION_MAX_PREP_SEC`, pas de tir pendant la préparation).
  - **zones adverses** : un bot qui va vers un point visé tourne sa direction vers la **tangente** de la première zone adverse sur sa route
    (rayon + `BOT_ZONE_AVOID_MARGIN`, à moins de `BOT_ZONE_AVOID_LOOKAHEAD` de son bord), sauf si le point visé est dans la zone (ballon,
    porteur : on y va) ou s'il est déjà dedans (il sort vers son but) ; le porteur pénalise de `BOT_CARRIER_ZONE_PENALTY` les directions qui en
    traversent une. L'ailier garde son comportement (son sprint boosté est désormais réservé à son rôle, le prédicat `abilityImplemented`
    étant vrai pour tous).
- **Rendu** : bouclier = arc translucide (couleur principale de l'équipe), liseré blanc (arcs + bords), déploiement lissé
  (`STYLE.shieldDeploySec`), flash blanc sur `blocked` ; grenades = sphère sombre cerclée de la couleur claire de l'équipe + traînée courte,
  position remontée sur la parabole (`grenadePoint` : `pos − vel·τ − ½gτ²ŷ`) ; une grenade qui disparaît n'a pas de traceur prolongé
  (l'explosion prend le relais) ; explosion = boule flat qui s'étend jusqu'au rayon et s'estompe + onde au sol (couleur de l'équipe) ;
  zones = disque translucide, rideau bas (visible de loin), bord + tirets qui tournent, pulsation, apparition et fondu ; plombs = traceurs
  courts de l'étape 5. **Aperçus du demi local** : anneau en tirets au point de pose de sa zone quand la capacité est prête, anneau + balise
  au point d'impact de sa grenade **en visée** (relief seulement). Signes de rôle (déjà présents, vérifiés en jeu) : crête plate = pilier,
  aileron = ailier, auréole = demi. Pools préalloués ; seuls les aperçus du demi allouent quelques vecteurs par image (fonctions pures de la sim).
- **HUD / entrées** : la puce de capacité affiche le libellé du rôle et son état : bouclier (temps restant, « appuie à nouveau pour baisser »),
  zone (vie restante de SA zone et cooldown en même temps), sprint boosté ; aucune nouvelle touche (A / LB = capacité, second appui = baisser
  le bouclier ; tir et visée inchangés : clic gauche / RT, clic droit / LT). Vibrations : `shieldBlock` (son bouclier bloque, léger),
  `explosionNear` (explosion à moins de `RUMBLE_EXPLOSION_NEAR_MULT × rayon` de ses pieds, moyen).
- **Correction annexe** : le freinage de la récupération de plongeon pouvait écrire `-0` dans la vitesse (composante négative × 0) ; révélé par
  les nouveaux matchs, corrigé (`+ 0`).
- **Tests** : `tests/sim/roles.test.ts` (fusil à pompe, bouclier, grenades, knockback, zones), `tests/bots/roles.test.ts` (comportements et
  matchs complets avec les trois rôles), `tests/game/roles.test.ts`, vues (bouclier, grenades, explosions, zones), vibrations ; le test de
  déterminisme scripté exige désormais explosions, capacités, zones et boucliers (graine d'entrées 99 : avec les explosions, la graine
  précédente ne produisait plus de réception en 5v5).
- **Mesures** (bots normal contre normal, 6 min, seeds 1 à 4 ; AVANT le réglage du rythme du §15) : 3v3 ≈ 29 essais, ballon porté 69 %, 11,5 %
  de joueurs au sol, ≈ 3 coups de pied ; 5v5 ≈ 16 essais, porté 59 %, 13 % au sol. Par match 3v3 : ≈ 240 explosions, ≈ 115 tirs bloqués par un bouclier, une zone posée
  ≈ 70 % du temps de jeu, ≈ 68 boucliers et ≈ 71 zones levés / posées ; plaquages répartis (ailier ≈ 32, pilier ≈ 35, demi ≈ 24 ; sur le porteur :
  ≈ 21 / 23 / 11). ≈ 0,5–0,9 s de calcul par match.
- **Limites connues** : la mêlée reste à faire (2e partie de l'étape 7 : faite, §14) ; un lob par-dessus un bouclier vers un coéquipier abrité derrière
  n'est arrêté que par la règle 2 du pilier ; les bots ne lisent toujours pas les projectiles en vol (pas d'esquive anticipée des grenades) ;
  le demi porteur qui se retourne pour poser une zone perd un peu de vitesse (marche arrière) ; le disque d'une zone posée sur un relief est
  plat (partiellement caché dans une butte).

## 14. Étape 7 (2e partie) : la mêlée

| Fichier | Rôle |
|---|---|
| `sim/scrum.ts` | `updateScrum` (étape 10 de `step`) : déclenchement, décompte, résolution ; lectures PURES `scrumMinPlayers`, `scrumRadius`, `scrumCaptureTicks`, `scrumMaxTicks`, `scrumInOvertime`, `scrumTicksLeft`, `scrumLooseReady`, `countInZone`. |
| `sim/types.ts` | `ScrumState` documenté ; nouvel événement `scrum_released` (0 contre 0). |
| `sim/rules.ts`, `sim/carrier.ts` | Fin du match et outils de test (`debugGiveBall`, `debugResetBall`) effacent la mêlée (la remise en jeu le faisait déjà). |
| `bots/scrumBrain.ts` | Approche (`scrumApproaching`, `shouldHoldZone`, `decideScrumApproach`), capture (`decideScrum`), cible de tir dans la zone (`scrumTarget`). |
| `bots/tactics.ts`, `bots/bot.ts`, `bots/memory.ts`, `bots/aiming.ts` | Branchement : ballon libre (approche), ballon `scrum` (capture) ; décision de toute l'équipe au début / à la fin de l'approche (`scrumAlert`) ; rôle tactique `scrum` (tir sans retenue). |
| `render/ScrumView.ts` | Zone de capture (shader : liseré au rayon exact, arcs de répartition, remplissage de la progression, prolongation dorée), rideau, apparition / fondu ; `scrumGauge` (PURE). |
| `render/FxView.ts`, `render/palette.ts` | Ondes `FX.scrumStart` / `FX.scrumWon` ; `PALETTE.scrum*`, `STYLE.scrum*`. |
| `game/matchHud.ts`, `ui/App.svelte` | HUD de la mêlée (décompte, jauge partagée, temps restant, prolongation, « tu comptes »), « MÊLÉE ! », « Mêlée gagnée par … ». |
| `input/haptics.ts` | `scrumStart`, `scrumWon`, `scrumLost`. |

Décisions (simulation) :

- **Déclenchement** (phase `play` seulement) : `ball.mode === 'loose'` et `ball.looseTicks ≥ secToTicks(SCRUM_LOOSE_SEC)` (`looseTicks` est
  incrémenté par `ball.ts` à l'étape 9 : un ballon lâché au tick L déclenche au plus tôt au tick L + 89, soit 90 ticks de ballon libre ; une
  passe ou un coup de pied en vol ne compte pas), ET au moins `scrumMinPlayers` (2 en 3v3, 3 en 5v5) joueurs **actifs** de chaque équipe à au
  plus `scrumRadius` (`SCRUM_RADIUS` × échelle) en distance **horizontale** pieds -> ballon (`≤` : un joueur pile au bord compte). Le test a lieu
  à l'étape 10, après le ramassage : un ballon ramassé à l'étape 9 du même tick n'est plus libre, pas de mêlée. Effets : `state.scrum` =
  { centre au sol sous le ballon (`groundHeight`), rayon, `ticks` = 0, décompte }, ballon `scrum` posé au centre (`BALL_RADIUS` au-dessus du
  sol), immobile (vitesse, rotations à 0 ; `ball.ts` l'immobilise à chaque tick ; aucun joueur ne le pousse), **non ramassable** (`carrier.ts`
  ne ramasse qu'un ballon `loose`), événement `scrum_start`.
- **Capture** : à chaque tick suivant, `ticks++` puis décompte des joueurs actifs de chaque équipe dans la zone (`down` et `getting_up` exclus :
  tirer pour plaquer les adversaires de la zone est la façon de la gagner — voulu). Projectiles, explosions et knockback continuent normalement
  (un joueur projeté hors de la zone ne compte plus) ; les joueurs entrent et sortent librement.
- **Résolution** : au tick où `ticks` atteint `secToTicks(SCRUM_CAPTURE_SEC)` (90 ticks après `scrum_start`), l'équipe la plus nombreuse gagne.
  **Égalité : prolongation en « premier qui mène »** jusqu'à capture + `secToTicks(SCRUM_TIE_EXTRA_SEC)` : la première équipe qui compte plus
  de joueurs que l'autre à la fin d'un tick gagne aussitôt. Choisi plutôt que « à la fin » : la prolongation récompense le premier plaquage
  dans la zone, elle se termine dès qu'il y a un écart (lisible : « premier qui mène » dans le HUD) et ne prolonge pas inutilement une
  mêlée déjà décidée. Encore à égalité à la fin : **un** tirage `state.rng` (`< 0,5` => équipe 0). Le gagnant reçoit le ballon **porté**
  (`giveBall` : `looseTicks` = 0, `lastTeam`, pas de nouvelle mêlée possible avant `SCRUM_LOOSE_SEC` de ballon libre) par son joueur actif
  **dans la zone** le plus proche du centre (égalité : plus petit id) ; événement `scrum_won`, `state.scrum = null`.
- **Gagnant sans joueur dans la zone** : impossible au décompte (l'équipe qui mène a au moins un joueur dedans) et au tirage, qui n'a lieu qu'à
  égalité NON nulle. **Règle sûre à 0 contre 0** (tout le monde plaqué ou sorti) : pas de tirage, le ballon est rendu **libre**, immobile, au
  centre (`looseTicks` = 0), événement `scrum_released`. Rejeté : donner le ballon au joueur de l'équipe tirée au sort le plus proche hors de la
  zone (le ballon « téléporté » à 30 m, voire dans l'en-but adverse => essai instantané).
- **Essai** : impossible pendant une mêlée (ballon non porté). Une mêlée gagnée par l'attaque **dans l'en-but adverse** donne le ballon à un
  joueur qui y a les pieds : essai à l'étape 11 du même tick (cohérent avec « ballon ramassé dans l'en-but adverse = essai ») — testé.
- **Interactions** : pas de mêlée en phase figée (`kickoff`, `try`, `ended`) ; remise en jeu (`setupKickoff`), fin du match (`endMatch`) et
  outils de test effacent `state.scrum` ; par sécurité, une mêlée dont le ballon n'est plus en mode `scrum` (état forgé) est oubliée. Le chrono
  tourne (tick joué). **Dernière minute inchangée** : aucune durée de mêlée n'est multipliée par `LAST_MINUTE_COOLDOWN_MULT` (testé).
- **Contrat** : `ScrumState` inchangé (`center`, `radius`, `ticks`, `counts`) ; la prolongation se lit avec `scrumInOvertime(scrum)` (ticks ≥
  capture), le temps restant avec `scrumTicksLeft`. Déterminisme : joueurs par id croissant, un seul tirage au plus, état JSON pur (tests
  d'aller-retour en pleine mêlée, 3v3 et 5v5).

Décisions (bots, `scrumBrain.ts`) :

- **Constat** : avec la règle « premier dans le cercle », un ballon libre est presque toujours ramassé en 1 à 2 s ; dans les matchs bots
  contre bots, ≈ 0,1 mêlée par match se déclenchait d'elle-même (et 0 en 5v5, où il faut 3 joueurs de chaque camp). Les bots doivent donc
  **jouer** la mêlée, comme le décrit le cahier des charges (« ils rentrent dans la zone pour peser sur le décompte »).
- **Approche** (`scrumApproaching`) : ballon libre depuis `BOT_SCRUM_APPROACH_SEC` (1,6 s depuis la correction de l'étape 7 ; 1,2 s avant :
  les bots tournaient autour de presque tous les ballons libres sans les prendre) avec un adversaire à moins de rayon +
  `BOT_SCRUM_THREAT_MARGIN` du ballon (**hystérésis** de `BOT_ROLE_HYSTERESIS_M` à la sortie : un adversaire qui rôde sur le bord ne fait plus
  basculer l'alerte à chaque tick). Le début et la fin de l'approche, ballon **toujours libre**, déclenchent une décision de toute l'équipe
  **au même tick** (`BotMemory.scrumAlert`) : sans cela, un chasseur encore lancé (décision toutes les ~0,4 s) ramassait le ballon que ses
  coéquipiers tenaient. Ce déclenchement ne passe pas par le temps de réaction : l'approche commence 1,6 s après que le ballon est devenu
  libre, bien après la réaction de tous les niveaux (0,22–0,5 s) — la situation « ballon libre » est déjà perçue, seule son horloge déclenche
  la décision (comme `decisionSec`). Un ballon **ramassé** ne déclenche rien ici (correction) : la perception retardée s'en charge, au lieu
  d'une décision prise sur une situation perçue « libre » avec un ballon déjà porté. `tactics.ts` relit la même alerte (`mem.scrumAlert`).
  - **Zone tenue** (`shouldHoldZone`) : si une mêlée est possible (au moins N joueurs actifs de chaque camp peuvent être dans la zone au
    déclenchement, temps de course jusqu'au bord ≤ temps restant + `BOT_SCRUM_REACH_SLACK_SEC`) et que l'équipe n'est pas en infériorité
    (au moins autant de joueurs que l'adversaire ; à égalité, les deux équipes tiennent), personne ne court au ballon : les entrants se placent
    autour, hors du cercle de ramassage (`BALL_PICKUP_RADIUS + BOT_SCRUM_HOLD_MARGIN`), et tirent sur l'adversaire le plus proche du ballon
    (celui qui va le ramasser) ; les autres gardent la forme d'équipe. Justification : au milieu des tireurs adverses, le porteur serait
    plaqué presque aussitôt (×`CARRIER_DAMAGE_MULT`) ; la mêlée se joue au décompte. Si elle ne se déclenche pas (`SCRUM_LOOSE_SEC +
    BOT_SCRUM_HOLD_GRACE_SEC` dépassé : décompte insuffisant dans le rayon), on ramasse. En infériorité : on va chercher le ballon (testé).
  - Sinon : les chasseurs vont au ballon (comportement de l'étape 6) et des entrants rejoignent la zone (pour la mêlée si elle se déclenche).
  - Mesuré : plus tôt (0,5–0,8 s), les chasseurs ramassent avant que tout le monde soit là, presque plus aucune mêlée.
- **Capture** (`decideScrum`, situation PERÇUE `scrum`) : « majorité confortable » — l'équipe envoie dans la zone au plus (adversaires
  actifs à moins de rayon + `BOT_SCRUM_THREAT_MARGIN` + `BOT_SCRUM_LEAD_MARGIN`) joueurs (humains de l'équipe déjà dedans déduits), les plus
  rapides à y entrer (hystérésis `BOT_ROLE_HYSTERESIS_M`), seulement ceux qui peuvent y entrer à temps ; ils visent un point à
  `BOT_SCRUM_INNER_FRACTION` du rayon de leur côté (répartis autour du ballon) et tirent sur l'adversaire de la zone le plus proche (rôle
  `scrum` : pauses entre rafales sans `BOT_RESTRAINED_PAUSE_MULT`). Les autres se placent **pour la suite** : soutien derrière la zone
  (cône de passe du futur porteur) + espace devant si l'équipe mène, défense étalée à `BOT_SCRUM_COVER_DEPTH` × échelle entre la zone et
  leur en-but sinon ; ils tirent aussi sur un adversaire de la zone à portée. Le demi n'y tire pas à moins de `BOT_GRENADE_MIN_DIST`
  (son propre souffle) : dans la zone, il compte surtout.
- **Résolution** : la situation perçue devient « ballon porté » (après le temps de réaction) : décision normale (porteur, soutien, défense).
- **Mesures** : voir §15 (après le réglage de la correction de l'étape 7, composition du jeu, 24 seeds : ≈ 2,5 mêlées par match en 3v3, ≈ 1,3
  en 5v5, ≈ 2 % du temps de jeu, 80 % décidées au bout des 3 s, le reste en prolongation, tirages très rares). Avant la correction, la mesure
  de l'implémentation (≈ 2,1 / 1,5 mêlées, essais « quasi inchangés ») était faite avec une autre composition que celle du jeu (tests/bots/helpers.ts :
  2 piliers en 5v5) et avec `BOT_SCRUM_APPROACH_SEC` = 1,2 s, qui coûtait en fait ≈ 3–5 points de ballon porté. ≈ 0,6 / 0,8 s de calcul par
  match (approche : un `ballLandingPoint` par bot et par tick de ballon libre).

Décisions (rendu, HUD, entrées) :

- **Zone** (`ScrumView`) : un disque unité mis à l'échelle du rayon EXACT de l'état, dessiné par un shader (une seule géométrie, uniforms par
  image) : liseré blanc au bord, bande de répartition (deux arcs aux couleurs des équipes, chacun grandit depuis le côté de son en-but —
  « tir à la corde » lisible de n'importe quel côté), remplissage **radial** de la progression (du centre vers la bande ; radial plutôt
  qu'un secteur d'horloge : lisible quel que soit l'angle de caméra), couleur de l'équipe qui mène (blanc à égalité) ; prolongation : liseré
  et remplissage dorés qui pulsent, le remplissage repart du centre. Rideau bas translucide (visible de loin). Disque plat (comme les zones
  du demi) : sur une butte, il est en partie caché. La progression est interpolée (`alpha`) ; fondu à la couleur du vainqueur après la
  résolution. `#include <colorspace_fragment>` : mêmes couleurs que les `MeshBasicMaterial` des équipes.
- **HUD** : sous le score (décalé sous l'étiquette « DERNIÈRE MINUTE »), « MÊLÉE » / « PROLONGATION », décompte et jauge partagée aux couleurs
  des équipes, temps restant de la phase en cours (`scrumGauge`, la même fonction que le rendu), « tu comptes » quand le joueur local est
  dedans (`inScrumZone`, la règle exacte de la sim exportée par l'API : le HUD n'en garde pas de copie, correction de l'étape 7) ; bannières « MÊLÉE ! » (`STYLE.scrumCallSec`, à la place de « JOUEZ ! » s'il y en a un) et « Mêlée gagnée par … » / « Mêlée :
  ballon rendu » (`STYLE.scrumResultSec`). Correction annexe : les bannières s'animent avec `banner-pop`, qui garde le `translateX(-50%)`
  (l'animation `count-pop` le remplaçait : bannière décalée pendant 0,3 s).
- **Vibrations** : `scrumStart` pour tout le monde (un temps fort du match, comme un essai), `scrumWon` / `scrumLost` selon l'équipe du
  joueur local (remplace l'ancien « réception » réservé au joueur qui recevait le ballon). Aucune nouvelle touche : clavier et manette
  identiques (entrer dans la zone, tirer).
- **Limites connues** : `scrumTarget` (bots) ne tient pas compte de la ligne de vue (un adversaire derrière un muret de la zone peut être
  visé) ; un humain qui ramasse le ballon pendant que les bots tiennent la zone coupe court à la mêlée (c'est la règle : premier dans le
  cercle). Pas de biais d'équipe : sur toutes les séries de mesure de la correction de l'étape 7 (≈ 300 matchs), mêlées gagnées 217 / 220 en
  3v3 et 136 / 133 en 5v5 (l'écart « 16 sur 17 » vu sur 8 seeds était du bruit).

## 15. Correction de l'étape 7 : rythme et constats de relecture

Relecture indépendante de l'étape 7 (bugs, architecture, équilibrage), puis correction. Mesures au harnais de relecture (matchs bots contre
bots de 6 min, difficulté normale, **composition du jeu par défaut** : 3v3 ailier, pilier, demi ; 5v5 ailier, pilier, ailier, demi, demi ;
seeds 1 à 24 sauf mention).

Correctifs :

- **Knockback** (`explosion.ts`, constat majeur) : vitesse minimale imposée le long du souffle au lieu d'une addition (§13). Avant, un coureur
  lancé à 8,8 m/s vers une explosion centrale n'était renvoyé que de 2,2 m par rapport à sa course (4,5 m pour un joueur immobile) et un ailier
  porteur boosté continuait même d'avancer ; la grenade du demi, qui tombe souvent derrière un porteur (avance partielle), le poussait vers
  l'en-but. Test : coureur qui fonce sur l'explosion renvoyé à la vitesse du souffle, fuyard plus rapide inchangé, deux souffles au même
  tick non cumulés, plafond.
- **Demi bot** (`aiming.ts`) : pas de grenade quand un adversaire touchable est sur les premiers mètres de la trajectoire (§13). Auto-knockbacks
  par match : 10 -> 0 en 3v3, 13,5 -> 3,5 en 5v5 (seeds 1–2 ; le reste : relief, foules). Test : adversaire collé sur la ligne de tir.
- **Alerte de mêlée** (`bot.ts`, `scrumBrain.ts`) : hystérésis à la sortie, pas de décision d'alerte sur un ballon ramassé (§14). Test unitaire de
  `scrumApproaching`.
- **HUD** : « tu comptes » lit `inScrumZone` (sim) au lieu d'une copie de la règle (§14). Test : `inScrumZone` = décompte de la sim.
- **Aide à la visée** : coupée bouclier levé et pour le lance-grenades (`aimAssistApplies`, §8). Test.
- **Tests** : matchs complets avec la composition du jeu (`gameRoles`, tests/bots/helpers.ts ; les scènes construites gardent leurs ids) ; mêlée
  coupée par la fin du match correctement détectée (`endMatch` efface `state.scrum` : l'ancien garde-fou ne pouvait jamais servir) et deux
  seeds par taille au lieu de quatre (8,3 -> ≈ 4,5 s) ; titre « 3vNaN » corrigé ; bornes de rythme resserrées (ci-dessous).
- **Docs** : le bouclier ne protège qu'un coéquipier collé dans son dos (§13) ; plus de « biais d'équipe » dans les mêlées (§14).

**Rythme** (constat majeur : ≈ 31 essais par match en 3v3 et 15 en 5v5 avec le code livré, objectif ≈ 4 à 12). Cause principale : un porteur
qui avait passé la défense ne pouvait plus être rattrapé (sprint × 1,22, ailier porteur boosté à 13,9 m/s, défenseur qui tire = défenseur qui ne
sprinte pas), et en 3v3 les contres après un plaquage convertissaient 50 à 64 %. Combinaison retenue : « S1 » du relecteur, vérifiée au harnais,
plus `BOT_SCRUM_APPROACH_SEC` d'un autre constat, avec **une différence** : `CARRIER_DAMAGE_MULT` 1,3 au lieu de 1,5 — une fois l'approche de
mêlée à 1,6 s, 1,5 ne donnait pas moins d'essais en normal (13,4 / 9,3 contre 13,3 / 9,8 sur 24 seeds) mais moins de ballon porté (57 % contre
59 % en 3v3) et plus de joueurs au sol (15,1 % contre 13,9 %), et 1,3 reste plus près du « un peu plus fort » du cahier des charges (feeling du
porteur, priorité absolue) ; contre des bots faciles, 1,5 marque ≈ 3 essais de moins. Uniquement des constantes :

| Constante | Avant | Après | Pourquoi |
|---|---|---|---|
| `SPRINT_SPEED_MULT` | 1,22 | 1,12 | Porteur rattrapable ; il reste le plus rapide (× 1,08 × 1,12 = 1,21 contre 1,12) |
| `BOOST_SPEED_MULT` | 1,2 | 1,1 | Ailier porteur boosté ≈ 11,7 m/s au lieu de 13,9 |
| `CARRIER_DAMAGE_MULT` | 1,1 | 1,3 | Défense plus forte ; ailier : porteur immobile plaqué en 1,0 s au lieu de 1,2 s |
| `FIELD_SCALE_3V3` | 0,7 | 0,84 | « 70 % de la taille » lu comme une surface (§4) |
| `BOT_SUPPORTERS_3V3` / `_5V5` | 1 / 2 | 2 / 3 | Le coureur « espace » devant ne servait qu'à alimenter les contres |
| `BOT_COVER_MIN_DEFENDERS` | 3 | 2 | Un défenseur se replie toujours, même à deux |
| `BOT_COVER_DEPTH` / `BOT_COVER_LINE_FRACTION` | 18 m / 0,7 | 26 m / 0,9 | Repli plus profond (devant le porteur, pas derrière) |
| `BOT_PRESSURE_RADIUS` | 7 m | 9 m | Le porteur bot passe plus tôt |
| `BOT_SCRUM_APPROACH_SEC` | 1,2 s | 1,6 s | Zone tenue seulement autour d'un ballon déjà disputé |

| Mesure (normal) | 3v3 avant | 3v3 après | 5v5 avant | 5v5 après |
|---|---|---|---|---|
| Essais par match (min–max) | 27,5 (24–33) | **13,3** (9–18) | 16,6 (12–22) | **9,8** (6–15) |
| Ballon porté / libre (part du jeu) | 66 % / 26 % | 59 % / 28 % | 52 % / 35 % | 47 % / 38 % |
| Joueurs au sol (temps-joueur) | 12,3 % | 13,9 % | 15,4 % | 16,2 % |
| Possessions converties en essai | 41 % | 23 % | 25 % | 16 % |
| Possession médiane | 5,2 s | 5,8 s | 4,5 s | 4,9 s |
| Vitesse moyenne du porteur | 10,4 m/s | 9,6 m/s | 11,4 m/s | 10,3 m/s |
| Temps porté sans défenseur devant (20 m) | 38 % | 20 % | 27 % | 18 % |
| Mêlées par match | 1,8 | 2,5 | 1,6 | 1,2 |

« Avant » = code de l'étape 7 avec les correctifs ci-dessus, sans le réglage (le code livré, mesuré par le relecteur avec l'ordre de rôles
`TEAM_ROLES_*` : 30,9 / 15,0). Composition `TEAM_ROLES_*` (humain pilier) après réglage : 13,6 / 9,1 (seeds 1–12). Facile / difficile après
réglage (seeds 1–8) : 19,4 / 12,9 essais en 3v3, 13,8 / 8,9 en 5v5. Le 3v3 reste en haut de la cible (≈ 13) : sans changer de règle, les
leviers crédibles plafonnent vers 12–14 (essayés en plus, dans le bruit de ± 1,5 : porteur × 1,05, un seul presseur, marquage plus large,
sprint 1,15).
**Prix à payer** : un peu moins de ballon porté et un peu plus de joueurs au sol (à revalider avec un humain ; si le ballon libre gêne en jeu
réel, réduire les plaquages de non-porteurs avec `BOT_RESTRAINED_PAUSE_MULT` 2,5 -> 3,5 plutôt que d'agrandir `BALL_PICKUP_RADIUS`, qui tue les
mêlées en 5v5). Bornes de rythme des tests (seeds 1–3) : essais 4–18 (3v3) / 4–14 (5v5), ballon porté ≥ 50 % / 40 %, au sol ≤ 17 % / 19 %
(resserrées au §17 : 4–16 / 4–12, porté ≥ 55 % / 45 %).
Temps pour plaquer par arme : docs/TESTING.md (étape 7).

Constats écartés ou partiels :

- **Réaction de l'alerte de mêlée** (le déclenchement ignore le temps de réaction) : écarté pour le début (l'approche commence 1,6 s après que le
  ballon est libre, bien après la réaction de tous les niveaux : c'est l'horloge d'une situation déjà perçue), corrigé pour le ballon ramassé et
  pour le « clignotement » (hystérésis).
- **Ballon libre 31–40 % du temps** : accepté comme prix du rythme (voir ci-dessus), pas de changement de règle.


## 16. Étape 8 : HUD et menus

| Fichier | Rôle |
|---|---|
| `ui/App.svelte` | Racine : canvas + routeur d'écrans (menu -> partie -> pause -> fin -> menu, panneaux par-dessus), clavier des menus (flèches, Échap). |
| `ui/state/app.svelte.ts` | État de l'application en runes : écran, panneau, choix du menu, réglages, périphérique actif ; transitions (`play`, `resume`, `restart`, `quitToMenu`, `back`) ; intentions manette -> navigation. |
| `ui/state/hud.svelte.ts` | Instantané de la session pour le HUD : `snap` (≤ 30 Hz + changements discrets) et `fast` (chaque frame : flèche du ballon, retours de visée). |
| `ui/state/nav.svelte.ts` | Navigation au VRAI focus du navigateur (portée `navScope`, spatiale, curseurs, anneau de focus visible au clavier / à la manette). |
| `ui/logic/focusNav.ts` | PUR : navigation spatiale (direction, score d'alignement, boucle verticale). |
| `ui/logic/controlHints.ts` | PUR : glyphes clavier / manette d'une action selon le périphérique et la famille (Xbox / PlayStation), structure du panneau des contrôles (`CONTROLS`, `CONTROL_GROUPS`). |
| `ui/logic/storage.ts` | PUR : JSON dans un stockage clé-valeur, try/catch partout (localStorage absent, qui jette, contenu corrompu). |
| `ui/hud/*` | `Hud` (calques), `ScoreBar`, `ScrumMeter`, `Announcer`, `StabilityGauge`, `ActionBar` + `CooldownPill` + `WeaponPill`, `RoleBadge`, `BallArrow`, `Crosshair`, `EventFeed`, `Callout`, `TrainingTools`, `DebugInfo`. |
| `ui/menu/*`, `ui/common/*` | Menu de lancement (`Menu`, `RoleCard`, `ControlsPreview`) ; `Glyph` (touches, boutons Xbox / PS, sticks, croix), `Icon` (signes géométriques), `Segmented`, `Toggle`, `Panel`, `NavHints`. |
| `ui/PauseMenu.svelte`, `EndScreen.svelte`, `ControlsPanel.svelte`, `SettingsPanel.svelte` | Pause, écran de fin, contrôles, réglages. |
| `game/ballArrow.ts` | PUR : mini-flèche hors champ (projection, ballon derrière la caméra, bord de l'écran, zones du HUD évitées). |
| `game/eventFeed.ts`, `game/names.ts` | PURS : flux d'événements (plaquages, interceptions, essais, mêlées), noms affichés (« Pilier 2 », « Toi »). |
| `game/roleCards.ts` | PUR : cartes de rôle (valeurs de ROLES, notes relatives 1..5, aperçu de l'équipe). |
| `game/settings.ts`, `game/launch.ts` | PURS : réglages du joueur et choix de lancement validés (`sanitize*`), paramètres d'URL et drapeaux de debug. |
| `input/menuNav.ts` | PUR : manette -> intentions de navigation (fronts, répétition, stick, boutons déjà enfoncés ignorés). |
| `render/SpectatorCamera.ts` | Caméra de biais qui suit le ballon (fond du menu). |

Décisions :

- **UI = lecture seule** : aucune règle de jeu dans `src/ui` ; tout vient de l'instantané `FrameSnapshot` de la session (enrichi : flux,
  ballon en repère caméra, invulnérabilité, régénération, cooldowns totaux, nom de la cible de passe…) ou des modules purs de `src/game`.
  L'UI n'importe toujours que `game` et `input` (test d'architecture) ; les valeurs de ROLES passent par `game/roleCards.ts`.
- **Performance** : un instantané par frame est produit (comme avant), mais l'UI ne publie le gros instantané qu'à 30 Hz (et aussitôt sur un
  changement discret : pause, fin, phase, porteur, statut, tir reçu, hitmarker…) ; ce qui suit la caméra (flèche, indicateurs de tirs reçus,
  réticule) est publié à chaque frame dans un petit objet séparé. `$state.raw` (pas de proxy profond), sous-composants qui ne lisent que leurs champs.
- **Fond du menu** : la session a deux modes. `attract` = match bots contre bots (5v5, entraînement, autopilote du joueur 0, caméra spectateur,
  aucune vibration, jamais en pause, pas d'anneau « humain ») ; `play` = la partie. `GameSession.launch(options)` passe de l'un à l'autre sans
  recréer le rendu ni le contexte WebGL. `?debug` lance la partie directement (comportement des étapes précédentes, scripts Playwright) ;
  `?debug&menu` affiche le menu ; `?debug&duration=<s>` raccourcit le match (écran de fin rapide).
- **Pause et menus** : la session décide encore des mises en pause automatiques (pointer lock perdu — au clavier avant la passe
  finale, quel que soit le périphérique depuis (§18) —, fenêtre qui perd le focus (§18), Start, manette active débranchée) ; la REPRISE, « Recommencer », « Rejouer » et le retour au menu sont décidés par l'UI. Les intentions de navigation de la manette
  (`MenuNavReader` dans l'InputManager) sont transmises par `GameSession.onMenuIntent` seulement quand aucun jeu n'est en cours (menu, pause,
  fin) : en jeu elles sont jetées (A = saut) — l'état « en jeu » est évalué AVANT de traiter Start, donc le Start qui met en pause ne reprend pas
  aussitôt. Le A / Start qui ferme un menu ne fait pas sauter (reset des entrées à la reprise, comme avant). L'ancien `consumeConfirm` de la session
  (A = reprendre / rejouer) est remplacé par les menus.
- **Clavier dans les menus** : `InputManager.gameplayActive` faux (menu, pause, fin) => les touches ne pilotent plus le joueur ni n'empêchent leur
  action par défaut (Tab, Espace, flèches) ; elles rendent seulement le clavier actif (glyphes). `pointerLockAllowed` : le canvas ne demande le
  pointer lock qu'en partie. `lockPending` : après « Jouer » / « Reprendre » au clavier, le menu de pause attend la réponse du navigateur (au plus
  1,5 s) au lieu de clignoter. Limite : Échap ne peut pas reprendre la partie au clavier hors `?debug` (le navigateur refuse le pointer lock sur
  Échap) ; « Reprendre » (clic / Entrée) ou Start à la manette le font.
- **Navigation** : vrai focus du navigateur (Tab, Entrée, lecteurs d'écran), navigation spatiale pure pour la croix / le stick / les flèches,
  gauche / droite font varier un curseur, B / Échap = retour, Start = jouer (menu) / reprendre (pause) / rejouer (fin),
  LB / RB = glyphes Xbox / PlayStation (panneau des contrôles). Focus initial `[data-autofocus]`, focus
  rendu à l'ouverture d'un panneau (au retour d'un panneau de la pause, sur son bouton). Anneau de focus visible au clavier / à la manette,
  masqué quand la souris bouge. Pas de piège de focus : la portée courante est la dernière du DOM ; un menu resté monté
  sous un panneau (menu de lancement sous Contrôles / Réglages) est `inert`, donc Tab ne l'atteint pas derrière le voile ;
  le menu de pause, lui, est démonté pendant un panneau.
- **Répétition** à la manette : `MENU_NAV_REPEAT_DELAY_SEC` / `MENU_NAV_REPEAT_SEC`, seuil du stick `MENU_NAV_STICK_THRESHOLD`
  (constants.ts, section MENUS ET RÉGLAGES DU JOUEUR) ; boutons de navigation en données (`DEFAULT_MENU_PAD_MAP`, gamepadMap.ts).
- **Réglages** (localStorage `ovalgun.settings.v1`) : sensibilité souris et caméra manette (multiplicateurs de `MOUSE_SENSITIVITY` /
  `GAMEPAD_LOOK_*_SPEED_DEG`, bornes et pas `SETTINGS_SENSITIVITY_*`), inversion Y (manette), aide à la visée, vibrations, volume réservé ;
  appliqués à chaud (`GameSession.applySettings` -> `InputManager.applySettings`, `Haptics.enabled`). Choix du menu (`ovalgun.setup.v1`) :
  taille, rôle, difficulté, entraînement ; l'URL prime (debug). Valeurs relues validées (`sanitizeSettings`, `sanitizeSetup`).
- **Mini-flèche du ballon** : position affichée du ballon en repère caméra (après le rendu) -> `offscreenArrow` : projection devant la caméra ;
  derrière, direction sans division par la profondeur (continue sur le côté), pile derrière => bas de l'écran ; placée au bord de l'écran
  (marge) ou au bord de la première zone du HUD traversée (score, jauge + actions, rôle). Couleur : libre (jaune), allié / adversaire (couleur
  de son équipe), mêlée (doré) ; distance horizontale. Masquée quand le joueur local porte le ballon ou que le ballon est mort.
- **HUD** : zone sûre centrée d'au plus 2,05 × la hauteur (en 21:9 les coins restent près du centre) ; taille de base fluide
  (`font-size: clamp(12px, 0.75vmin + 8px, 19px)`, tout en rem). Jauge de stabilité : couleur par niveau, traînée de perte, tremblement + flash à
  chaque tir reçu (deux animations identiques alternées : la barre n'est pas recréée), « PLAQUÉ » + temps et progression du relevé,
  invulnérabilité (liseré + étiquette). Pastilles radiales (SVG) : esquive, glissade / plongeon, passe (cible) et coup de pied quand on porte,
  capacité (durée active ou recharge ; zone du demi : vie de la zone), arme (munitions, rechargement) ; touche ou bouton du périphérique
  actif. Messages personnels (feedback.ts) près du réticule, à droite (la caméra épaule place le joueur à gauche). Grandes annonces au centre.
  Durées du flux et seuil des dixièmes du chrono : `STYLE.feed*`, `STYLE.clockTenthsBelowSec` (palette.ts, visuel).
- **Accessibilité** : contrastes (fonds bleu nuit opaques derrière les textes, libellés des pastilles sur pastille sombre), tailles en rem,
  pulsations / tremblements / « pops » sous `prefers-reduced-motion: no-preference` (les fondus d'information restent), rôles ARIA (radiogroup,
  switch, dialog, status), glyphes avec libellé.
- **Remapping** (plus tard) : le panneau des contrôles est construit depuis `CONTROLS` (une ligne = des actions de `Keymap` / `GamepadMap`) ;
  rendre une cellule éditable consistera à remplacer ces liaisons et à passer la nouvelle carte à l'InputManager. Pas d'édition maintenant.
- **Tests** : `tests/game/ballArrow.test.ts`, `eventFeed.test.ts`, `roleCards.test.ts`, `settings.test.ts` (+ lancement / URL),
  `matchHud.test.ts` (dixièmes), `combatHud.test.ts` (compteur de tirs reçus), `tests/input/menuNav.test.ts`, `tests/ui/focusNav.test.ts`,
  `controlHints.test.ts`, `storage.test.ts` ; correction : `aimAssist.test.ts` (`resetAssistCandidates`),
  `menuNav.test.ts` (stick maintenu en jeu puis pause, `leftGame`), `matchHud.test.ts` (`matchMvp`), `ballArrow.test.ts`
  (marge des zones évitées), `roleCards.test.ts` (`compositionText`). Vérification visuelle Playwright (menu clavier et fausse manette, HUD, pause, réglages, fin ;
  1280×720, 1920×1080, 900×600, 2560×1080).
- **Correction de l'étape 8 (constats de relecture)** :
  - *Aide à la visée après `launch()`* : les candidats (`AssistCandidate`, un par joueur, avec son équipe) n'étaient
    construits qu'à la création de la session ; depuis que `launch()` change la taille d'équipe (menu 5v5 -> partie 3v3),
    ils gardaient les équipes du 5v5 (2 adversaires sur 3 ignorés, 4 « fantômes ») ou manquaient (3v3 -> 5v5 : exception à
    chaque frame, fond du menu figé). Ils sont recréés à chaque match (`resetAssistCandidates`, aimAssist.ts, testé).
  - *Navigation remise à zéro à la sortie du jeu* : `GameSession.loop` retient « en jeu » à la frame précédente et appelle
    `resetMenuNav()` quand on en sort (Start, manette débranchée, Échap, pointer lock perdu, fin du match ; `leftGame`,
    menuNav.ts). Un stick / une croix / un bouton maintenu depuis le jeu est ignoré jusqu'à son relâchement (avant : la
    répétition du stick de course faisait défiler le focus de la pause jusqu'à « Quitter vers le menu »).
  - *Pause* : « Recommencer » et « Quitter vers le menu » demandent un second appui (le bouton passe au rouge « Confirmer
    … ? » pendant 2,5 s ; quitter le bouton annule). Au clavier hors `?debug`, l'aide n'annonce plus « Échap : Reprendre »
    et Échap met le focus sur « Reprendre » (Entrée / clic reprennent, dans un geste accepté par le navigateur).
  - *Écran de fin* : « Joueur du match » calculé par `matchMvp` (matchHud.ts, testé ; poids `STYLE.mvpWeights`, `mvpId`
    dans `FinalResult`), suivi du nom de son équipe (les noms « Ailier 1 »… existent dans les deux équipes) ; Start =
    Rejouer ; délai d'activation `STYLE.endScreenInputDelaySec` porté de 1 à 1,5 s (des A répétés au coup de sifflet ne
    sautent plus les statistiques).
  - *Seuils visuels hors de l'UI* : jauge jaune (`STYLE.stabilityBarMidFraction`) et munitions basses
    (`STYLE.ammoLowFraction`) arrivent par l'instantané (`stabilityMid`, `ammoLow`) ; pas du volume exporté
    (`VOLUME_STEP`, settings.ts) ; note de composition du 5v5 tirée de `TEAM_ROLES_5V5` (`compositionText`, roleCards.ts).
  - *Mini-flèche* : chaque zone évitée est agrandie du rayon de la flèche (disque + pointe, `avoidMargin` de
    `offscreenArrow`, 2,4 rem) : elle ne recouvre plus l'étiquette « ENTRAÎNEMENT » / « DERNIÈRE MINUTE » sous le score.
  - *Panneaux* : focus initial sur la première option (curseur de sensibilité souris, bascule Xbox / PlayStation) et non
    plus sur « Retour » ; LB / RB basculent les glyphes du panneau des contrôles (`app.controlsStyle`) ; le corps des
    panneaux laisse la place de l'anneau de focus (il était rogné à gauche et à droite) ; menu de lancement `inert` sous
    un panneau.
  - *Lisibilité* : contour sombre extérieur de la jauge de stabilité (vert menthe sur herbe ≈ 2:1 avant) et libellé
    « STABILITÉ » sur pastille sombre.
- **Limites connues** : en 900×600 le menu défile (l'aperçu des contrôles passe sous les cartes) ; la zone « rôle » évitée par la flèche suppose
  la mise en page large (en petite fenêtre l'indicateur de rôle monte en haut à gauche) ; navigation spatiale : depuis le bout d'une rangée,
  « droite » peut atteindre la colonne de droite plus bas (Contrôles / Réglages) — voulu, il n'y a rien d'autre à droite.


## 17. Passe finale : simulation et bots

Audits indépendants (simulation, bots, architecture online, feeling du porteur), constats vérifiés, puis correction. Mesures au
harnais (matchs bots contre bots de 6 min, composition du jeu, normal, seeds 1 à 24 ; tableaux dans docs/TESTING.md, « Passe finale »).

Correctifs (simulation) :

- **Pas de −0 dans l'état** (constat majeur) : `wishDirection` (reculer avec yaw = 0 : `(−1)·0 + 0·(−1) = −0`, recopié dans
  `vel` et `moveDir`) et `slideVelocity` (glissade bloquée : direction négative × vitesse 0) ajoutent `+ 0`. Le hash ne changeait
  pas (JSON écrit 0) mais l'invariant du §2 était violé. Les contrôles de valeurs des matchs scriptés (`determinism.test.ts`,
  `rules.test.ts`) rejettent désormais les −0 ; tests dédiés (recul, glissade contre le mur invisible). Fuzz : aucun −0 à chaque
  tick sur 6 matchs de bots et 8 matchs à entrées aléatoires.
- **Élan aérien borné** (constat majeur, feeling du porteur) : un saut tamponné repart au tick de l'atterrissage et l'élan aérien était
  gardé sans limite : une esquive suivie de sauts tenait 12,6 m/s pour TOUS les rôles, esquive + sauts ≈ 14 m/s (pilier porteur :
  8,7 au sprint, + 62 % ; contre les bots, conversion des possessions de l'humain pilier 15 % -> 63 % en 3v3). Désormais, en l'air
  (avec ou sans entrée, plongeon aérien compris), l'excès au-delà de `maxRunSpeed` (vitesse du rôle × sprint × porteur ×
  capacités) s'éteint à `AIR_OVERSPEED_DECEL` (8 m/s²). Le dash-saut reste plus long qu'un saut (l'excès s'éteint en ≈ 0,25 s),
  un knockback (≈ 10 m/s) perd moins de 0,1 m, le grenade jump est intact (vertical). Nouveau module `momentum.ts` (partagé par
  player.ts et carrier.ts sans import circulaire).
- **Esquive avant réduite** : vitesse du dash = `DODGE_SPEED × (1 − (1 − DODGE_FORWARD_SPEED_MULT)·c²)`, c = max(0, cos(direction,
  regard)) au déclenchement, mémorisée dans le nouveau champ `PlayerState.moveSpeed` (lu par `dodgeVelocity` / `exitDodge`). Une
  esquive latérale ou arrière garde 21 m/s ; droit devant 14,7 m/s (sortie 8,8 : sous le sprint). L'esquive est une feinte
  latérale, le plongeon reste l'accélération vers l'avant. Esquive en boucle (porteur ailier) 12,9 -> 11,4 m/s, esquive + sauts
  13,9 -> 11,2 (sprint 10,6) ; test « hacher sa course n'est pas plus rapide que le sprint » sur les trois rôles. Rejeté : réduire
  `DODGE_EXIT_SPEED_KEEP` (affaiblit aussi l'esquive latérale, celle qui sert à éviter les tirs).
- **Tampon d'esquive** (`DODGE_BUFFER_SEC` = 0,12 s, nouveau champ `dodgeBufferTicks`, sur le modèle du saut) : un appui 1 à 3 ticks
  avant la fin du cooldown (ou pendant une grimpe / un plongeon) part dès que l'esquive est possible ; remis à 0 au plaquage et à
  la remise en jeu (`resetPlayerAt`). Les bots n'appuient que quand l'esquive est prête : aucun effet sur eux.
- **Plongeon aérien** : la récupération en l'air garde l'élan mais freine l'excès (même règle) : 14 m en 1 s -> ≈ 12 m ; saut +
  plongeon en boucle 11,45 -> 11,1 m/s (ailier). « Essai en vol » conservé.
- **Séparation et relief** (constat mineur) : après chaque poussée de `separatePlayers`, `settleAfterPush` ressort le joueur des
  faces de murets / rampes (sinon, poussé dans l'empreinte d'un muret, il le grimpait au tick suivant sans aucune entrée) et recolle
  au relief un joueur au sol (pieds jusqu'à 5–8 cm sous une butte pendant un tick ; poussé au bord d'un relief, il tombe).
- **Nits** : fin du match — un joueur en l'air (saut, grimpe, knockback) est posé au sol (il restait suspendu derrière l'écran de
  fin translucide) ; ballon mort (`killBall`) ramené dans l'arène (5 cm au-delà du mur invisible après un essai le long de la
  touche ; le ballon PORTÉ, lui, peut toujours dépasser de 5 cm — purement visuel, `carryPosition` partagé avec le rendu) ; test
  d'architecture : `WeakRef`, `FinalizationRegistry` (dépendent du ramasse-miettes), `SharedArrayBuffer`, `Atomics` interdits.
- **Constantes** : mention « ↑ = … » ajoutée aux leviers qui ne l'avaient pas (esquive, saut, glissade, ballon, terrain, corps…) ;
  restent sans flèche les valeurs sans « sens » (tick, booléens, compositions, tables, disposition du terrain).

Correctifs (bots) :

- **Receveur** (constat majeur, deux audits) : il « gardait sa ligne » (direction de sa DERNIÈRE ENTRÉE, pleine vitesse, sprint
  précédent) alors que `planPass` vise sa position anticipée d'après sa VITESSE ; un soutien qui ralentissait pour arriver à son
  poste repartait à fond et dépassait le ballon (≈ 10 % des passes au sol en 3v3, 15 % en 5v5, celles de l'humain vers un bot
  comprises). Désormais `decideReceive` vise le point de réception réel et `steerReceive` (steering.ts) le recalcule à chaque tick
  (`predictPassCatch`, fonction PURE de la sim : premier point où la trajectoire exacte gravité + traînée redescend à
  `PASS_TARGET_HEIGHT` au-dessus de l'appui, c'est-à-dire le point visé par `planPass`) et règle l'allure pour y arriver
  `BOT_RECEIVE_TIME_MARGIN_SEC` avant le ballon (sprint seulement s'il le faut ; arrêt à `BOT_RECEIVE_ARRIVE_RADIUS`). Pas de
  réflexe d'esquive pendant la réception. Passes au sol : 10,5 -> 0,9 (3v3) et 15,7 -> 1,8 (5v5) par match. Variante écartée :
  garder la ligne en conservant l'allure (le relecteur : 14,3 passes au sol en 5v5, ne règle rien).
- **Passe sous le feu lointain** (constat majeur) : `choosePass` comparait la liberté des receveurs à celle du porteur, calculée
  sur la seule distance au plus proche adversaire ; sous le feu du dernier défenseur (15–26 m, personne à moins de
  `BOT_PRESSURE_RADIUS`), le porteur valait 1 et ne passait JAMAIS (branche « sous le feu, stabilité basse » morte). Liberté du
  porteur = min(distance / `BOT_PRESSURE_RADIUS`, stabilité restante). Passes tentées 102 -> 171 (3v3), porteurs plaqués 56,5 -> 49.
- **Marquage stable** (constat mineur) : `BOT_MARK_HYSTERESIS_M` (le marqueur qui suivait déjà ce receveur s'en compte plus
  proche) et `BOT_MARK_DANGER_STICKY` (bonus de danger du receveur déjà marqué), comme `roleBonus` pour les autres rôles. Changements
  de receveur 46 -> 17 (3v3) et 58 -> 32 (5v5) par minute de marquage, ping-pong 11 -> 1,5 et 13 -> 5 ; essais inchangés (dans le
  bruit, 24 seeds).
- **Nits** : `BOT_SCRUM_SUPPORTERS` (le `2` en dur de scrumBrain.ts, valeur inchangée) ; code mort de l'étape 6 supprimé
  (`unarmedPenalty`, `UNARMED_RANK_PENALTY`, branche « arme non implémentée » de `engageRange`) ; `weaponImplemented` /
  `abilityImplemented` restent exportés (toujours vrais, points d'extension pour de futures armes).

**Rythme** (normal, 24 seeds) : 3v3 12,8 -> **11,5** essais (5–16), 5v5 10,0 -> **6,5** (3–12) — dans la cible ≈ 4 à 12 sans toucher
aux constantes de rythme du §15 ; ballon porté 60 -> 67 % / 48 -> 55 %, joueurs au sol 13,9 -> 14,6 % / 16,0 -> 17,4 %, mêlées
2,2 -> 1,4 / 1,4 -> 1,1 par match (moins de ballons libres : les seeds du test de mêlée en match complet ont été rechoisies). Facile
/ difficile (seeds 1–8) : 3v3 21,0 / 9,6, 5v5 13,0 / 5,3 — le 3v3 facile reste rapide (accepté : c'est le niveau où l'humain doit
gagner ; à revoir avec de vrais joueurs). Bornes des tests (seeds 1–3) : essais 4–16 (3v3) / 4–12 (5v5), ballon porté ≥ 55 % / 45 %,
au sol ≤ 17 % / 19 %, au plus 5 % de passes au sol, au plus 40 changements de receveur marqué par minute de marquage.

| Constante | Avant | Après | Pourquoi |
|---|---|---|---|
| `AIR_OVERSPEED_DECEL` (nouvelle) | — (0) | 8 m/s² | Élan aérien borné au plafond de course |
| `DODGE_FORWARD_SPEED_MULT` (nouvelle) | — (1) | 0,7 | Esquive = feinte latérale, pas une locomotion |
| `DODGE_BUFFER_SEC` (nouvelle) | — (0) | 0,12 s | Appui d'esquive un peu trop tôt honoré |
| `BOT_RECEIVE_KEEP_LINE_MIN_MAG` | 0,3 | supprimée | Le receveur ne garde plus sa ligne |
| `BOT_RECEIVE_TIME_MARGIN_SEC` / `BOT_RECEIVE_ARRIVE_RADIUS` (nouvelles) | — | 0,15 s / 0,4 m | Course « juste à temps » au point de réception |
| `BOT_MARK_HYSTERESIS_M` / `BOT_MARK_DANGER_STICKY` (nouvelles) | — (0) | 3 m / 0,3 | Marquage sans ping-pong |
| `BOT_SCRUM_SUPPORTERS` (nouvelle) | 2 en dur | 2 | Valeur de réglage sortie du code |

Constats écartés ou reportés :

- **Tampon de passe / coup de pied pendant le plongeon** (proposé avec le tampon d'esquive) : reporté. Il faudrait mémoriser QUEL
  geste (deux champs d'état) et une passe partirait jusqu'à 0,15 s après l'appui, vers une cible qui a pu changer ; le HUD masque
  déjà les indicateurs de passe pendant le plongeon et la récupération (`canCarrierAct`), l'appui perdu y est donc signalé.
- **`DeepReadonly<MatchState>`** pour les bots (Readonly est superficiel) : reporté. Toutes les lectures de la sim appelées par les
  bots et le rendu (`selectPassTarget`, `planPass`, `kickLaunch`, `queries.ts`…) devraient changer de signature ; la garantie reste
  le test à l'exécution (JSON identique avant / après chaque appel de bot) et la vérification de l'audit (4 matchs complets).
- **Caméra, risque de passe, sprint automatique, latence de l'esquive au clavier** (audit du feeling du porteur) : traités côté
  client (src/render, src/input) par la correction suivante (§18), hors de celle-ci.

Préparation au online (constats de l'audit d'architecture, rien à coder dans le prototype) :

- **Événements** : `state.events` ne contient que le DERNIER tick. Un serveur qui n'envoie pas chaque snapshot doit tenir un journal
  `{ tick, events[] }` et transmettre au client tous les événements depuis le dernier tick acquitté, hors snapshot. Côté client, les
  transitions critiques gagneraient à être déclenchées par l'état (`prev.phase !== 'kickoff' && state.phase === 'kickoff'` pour la
  caméra, `state.phase === 'ended'` pour relâcher le pointer lock) plutôt que par les seuls événements.
- **Entrées manquantes** : la sim accepte l'omission (entrée neutre, §2) et la répétition. Mesuré : omettre une entrée freine un
  porteur qui sprinte (10,64 -> 8,64 m/s pendant un tick ; trois de suite ≈ 0,2 s de freinage visible) ; répéter la dernière entrée
  reçue ne freine pas et ne crée aucun faux front montant (`lastButtons` contient déjà les bits répétés). Politique conseillée :
  répéter la dernière entrée, réserver l'omission à la déconnexion ; enveloppe réseau `{ tick, input }` avec les 2–3 dernières
  entrées répétées dans chaque paquet (un appui bref — esquive, passe — n'est pas perdu).
- **Taille du snapshot** : 6,6 KB (3v3) à 9,8 KB (5v5) de JSON par tick en moyenne (gzip ≈ 1,9 / 2,5 KB), dont ≈ 1,2 KB de données
  statiques (`field`, `config`). Format réseau prévu sans toucher la sim : `field` et `config` envoyés une fois (le client refait
  `createField(config.teamSize)`), pas de `rng` pour les clients (sinon ils prédisent les tirages : rebonds, dispersion, tirage
  d'une mêlée), deltas par rapport au dernier snapshot acquitté. Coût CPU mesuré : 0,08 / 0,12 ms par tick pour `step` et 0,21 /
  0,46 ms pour les bots (3v3 / 5v5).
- **Contrôle par hash** (`hashState`) : fiable entre moteurs V8 (navigateurs Chromium, Node, workerd) ; les fonctions
  transcendantes (`Math.sin`, `Math.exp`…) ne sont pas garanties identiques au bit près entre moteurs. Entre client et
  serveur, le snapshot fait donc autorité, sans comparaison de hash (§20).
- **Identifiants** : prêts (`humanId` paramétrable, `externalIds` des bots, `botInput` et `BotMemory` sérialisables et exportés).



## 18. Passe finale : client, caméra et UI

Constats des audits client, UX et feeling du porteur (vérifiés par un relecteur sceptique), puis correction côté
`src/render`, `src/input`, `src/game`, `src/ui`. La simulation et les bots ne changent pas (aucune règle, aucun hash) :
seules des constantes de caméra / d'entrée, des signaux de vibration et un nom court de capacité (`hudLabel`) ont été
ajoutés à constants.ts. Les tests de match bots contre bots passent à l'identique.

| Fichier | Rôle |
|---|---|
| `render/fadeMath.ts` | **Nouveau**, PUR : `smoothstep`, distances point / segment et segment / segment, `occluderFade`, `localFade`. |
| `render/colors.ts` | **Nouveau** : couleurs de la palette précalculées en `THREE.Color` (plus d'analyse de chaîne CSS à chaque image). |
| `render/cameraMath.ts`, `ShoulderCamera.ts` | Collision balayée ; pivot du porteur monté (`raise`, lissé comme la distance). |
| `render/PlayerView.ts` | Matériaux propres en alpha hash, `bodyAxis`, `setFade` ; halo d'invulnérabilité. |
| `render/Renderer.ts` | `updateFades`, `passRiskOf` / `passRisk`, `setReducedMotion`, rapport de pixels dans `resize()`. |

Décisions :

- **Joueurs estompés près de la caméra** (constat majeur) : 6 à 8 % du temps en 5v5, la capsule d'un autre joueur était à
  moins de 1 m de la caméra et couvrait jusqu'à la moitié de l'écran. Le Renderer calcule chaque image, pour chaque joueur,
  la distance de la caméra à la surface de sa capsule affichée (`PlayerView.bodyAxis` : posture basse et corps couché
  compris) et, pour les autres, la distance au segment caméra -> dos du joueur local (pivot moins `STYLE.lineFadeBehind`
  le long du regard : un adversaire DEVANT le joueur local, qu'il vise, n'est jamais estompé). Opacité :
  `smoothstep(cameraFadeNear 0,4, cameraFadeFar 1,8)` ; entre la caméra et soi, jusqu'à `lineFadeMin` 0,35 ; joueur local :
  `smoothstep(localFadeNear 0,5, localFadeFar 1,6)` (en visée, ≈ 2,4 m : opaque). Rendu en **alpha hash** (tramage stable
  en espace objet, dans la passe opaque, `depthWrite` gardé) : pas de tri des transparents, pas de bascule opaque /
  transparent qui recompilerait un programme ; d'où des matériaux propres à chaque joueur (corps, contour, visière, reflet,
  arme, signe, poignée), clonés de `PlayerAssets` avec `alphaHash: true` (même programme pour tous). Sous
  `fadeDetailsBelow` (0,5) : barre de stabilité et étoiles masquées ; sous `fadeHideBelow` (0,05) : joueur masqué. Le
  halo d'invulnérabilité s'éteint plus vite que le corps (ses faces arrière délaveraient le tramage). Mesuré (5v5,
  autopilote, 200 échantillons) : capsule à moins de 1 m de la caméra 1,5 % du temps, jamais à plus de 50 % d'opacité.
  Écarté : vraie transparence (tri par objet entre corps, contour et visière, artefacts).
- **Cadrage** (constat mineur, polish demandé) : l'invariant du §3 est gardé pour tout joueur qui tire. Deux réglages :
  regard à `KICKOFF_PITCH_DEG` (−8°) à chaque coup d'envoi et au lancement (`GameSession.faceKickoff` ; avant : horizon
  au milieu de l'écran, moitié ciel) ; et **pivot du porteur monté** de `CAMERA_CARRY_RAISE` (1 m, constat majeur du
  feeling du porteur : sa capsule masquait la bande sous l'horizon droit devant lui, là où se tient le défenseur qui lui
  barre la route ; tête du porteur à ≈ 9,5° sous l'horizon, défenseur à 6, 12 et 20 m visible). Le porteur ne tire pas ;
  la montée est lissée par `CAMERA_BLEND_RATE` et remise EXACTEMENT à 0 sous le millimètre (test : la droite de tir se
  reprojette au centre après la passe). Elle repousse aussi le contact avec le sol quand le porteur lève les yeux pour une
  chandelle (34° : caméra à 4,1 m au lieu de 2,3). Écarté : biais d'inclinaison de la vue avec un réticule décalé vers le
  haut (toute l'UI du réticule, des retours de visée et de la mini-flèche à recaler, pour un gain que le −8° couvre).
- **Collision balayée** (constat mineur) : `shoulderPose` échantillonne le segment pivot -> caméra voulue tous les
  ≤ 0,1 m et place la caméra sur le dernier échantillon libre (avant : seule l'extrémité était testée, ligne de vue jusqu'à
  0,67 m dans une butte ou une rampe, 0,5 à 0,7 % des poses près du relief). ≈ 50 `groundHeight` par image.
- **FOV de vitesse** : `CAMERA_FOV_SPEED_GAIN` 1,2 -> 3 (plafond 6° inchangé) : ailier porteur au sprint +5,5° (avant
  +2,2°), l'esquive ne dépasse plus le sprint que de ≈ 0,5° (avant +3,8° : la « pulsation » que le plafond voulait éviter).
- **Une seule passe pour les transparents double face** (constat majeur, performance) : three.js dessinait chaque
  matériau `transparent && DoubleSide` en deux passes en changeant `side` + `needsUpdate` à chaque fois, donc un
  `getProgram` par objet et par image (≈ 43 % des allocations JS, 13 % du temps de la boucle). `forceSinglePass: true`
  partout (traceurs, étincelles, flashs, explosions — boule fermée en `FrontSide` —, voile des murs, traînée du ballon,
  anneaux, indicateurs de passe, mêlée, zones, bouclier) ; test qui parcourt toutes les vues. Mesuré : `material.version`
  reste à 0 (avant : jusqu'à 11 370 après 25 s), appels de dessin 168 en moyenne / 278 au pic en 5v5 (avant 194 / 426).
- **Lisibilité des effets** : étincelles — une gerbe par joueur touché et par tick (`sparksPerHit` 3 par balle,
  `sparksPerPelletHit` 4 par décharge de plombs) et une gerbe de relief par tireur et par tick, pool 120 -> 64 (avant : 48
  étincelles par décharge, pool saturé) ; mesuré : 15,6 visibles en moyenne, 49 au pic. Éclat de plaquage du joueur local
  ×`tackleBurstLocalScale` (0,5 : il couvrait les deux tiers de l'écran). **Halo d'invulnérabilité** : coque à la couleur
  CLAIRE de l'équipe, faces arrière seulement (un liseré autour du corps, qui garde sa couleur d'équipe ; avant, film
  blanc par-dessus), `invulnScale` 1,22, opacité 0,75 ± 0,15 à 9 rad/s (≈ 1,4 Hz, sous les 3 flashs/s ; avant 0,5 ± 0,3 à
  6,4 Hz), sans pulsation sous `prefers-reduced-motion: reduce` (`GameSession` -> `Renderer.setReducedMotion` ->
  `PlayerAssets.reducedMotion`).
- **Risque de la passe** (constat mineur) : l'humain se faisait intercepter 7 à 10 % de ses passes (54 à 73 % sous une
  openness de 0,15) contre ≈ 1 % pour les bots, qui filtrent sur le démarquage. `passRiskOf(openness)` reprend LES SEUILS
  DES BOTS : démarqué ≥ `BOT_PASS_MIN_OPENNESS` (vert), risqué (ambre `PALETTE.passRisky`), marqué
  < `BOT_PASS_MIN_OPENNESS_OWN_THIRD` (rouge-orangé `PALETTE.passMarked`) ; flèche, chevron, trait et éventail prennent la
  couleur ; instantané `passRisk` ; pastille « → Pilier 2 · marqué ». Aucune règle de sim ne change.
- **Porteur au clavier : sprint automatique** (constat mineur, `CARRIER_AUTO_SPRINT`) : le porteur ne vise ni ne tire, Maj
  ne lui servait qu'à sprinter, et l'esquive au relâchement coûtait 77 à 157 ms (perdue au-delà de 150 ms d'appui).
  Porteur local : SPRINT émis à chaque tick (`composeInput.autoSprint` ; la sim ne l'applique que dans le cône avant, stick
  assez incliné — un stick à moitié poussé trottine encore) et `TapHoldState.dodgeOnPress` (esquive à l'enfoncement, mode
  figé à l'appui : pas de double esquive ni d'esquive perdue si le joueur attrape / passe le ballon pendant l'appui). À la
  manette, L3 devient inutile pour le porteur. Aide des contrôles mise à jour.
- **Retours du porteur** : vibrations `dodge`, `dive`, `passThrown`, `kick` (gestes du joueur local, priorités ≤ 2) et
  `passCompleted` (sa passe attrapée par un coéquipier — l'équipe du receveur arrive par `teamOf` ; un coup de pied repris
  par l'adversaire ne vibre pas) ; message « Passe réussie → Pilier 2 » (feedback.ts ; un coup de pied repris par un
  coéquipier compte aussi, l'événement 'catch' ne dit pas s'il s'agissait d'une passe ou d'un coup de pied).
- **Pause** (constat mineur) : à la manette, Échap (sans pointer lock) met en pause (App.svelte), la fenêtre qui perd le
  focus met en pause (`InputManager.onFocusLost`, hors `?debug`), et la perte du pointer lock met en pause quel que soit le
  périphérique actif (avant : clavier seulement ; alt-tab laissait les bots jouer et marquer).
- **Rapport de pixels** (constat mineur) : `Renderer.resize()` réapplique `min(devicePixelRatio, STYLE.maxPixelRatio)` ;
  la session surveille `matchMedia('(resolution: Xdppx)')` (réarmée à chaque changement) pour un zoom ou un changement
  d'écran sans redimensionnement.
- **HUD** (constats UX) : le HUD reste monté pendant toute la partie et n'est que masqué (`visibility`, pas `display`) en
  pause / attente du pointer lock — le remonter rejouait le tremblement + flash de « tir reçu » et le « pop » des scores à
  chaque reprise ; en plus, la jauge ne réagit qu'aux tirs reçus APRÈS son montage et un score ne « saute » que s'il a
  changé depuis le montage. « TOI » sorti du bloc biseauté (le `clip-path` le rognait entièrement), sous son bord
  extérieur (l'étiquette « ENTRAÎNEMENT » / « DERNIÈRE MINUTE » reste dégagée). Nom court de capacité
  (`ROLES.demi.ability.hudLabel` = « Zone lente » ; « Zone de ralentissement » était tronqué à toutes les tailles).
  Texte secondaire des pastilles 0,6 -> 0,78 rem (cible de passe à 10,5 px en 1280×720 au lieu de 8), libellés
  0,68 -> 0,75 rem, pastille 6,6 -> 7,2 rem de large. Curseur masqué quand on joue à la manette (aucun pointer lock).
  Au sol, toutes les pastilles d'action sont barrées (l'esquive et la glissade semblaient prêtes).
- **Nits** : traînée du ballon coupée sur une téléportation — saut de plus de `STYLE.teleportDist` entre deux ticks
  (remise en jeu), ou depuis son dernier point à plus de `STYLE.trailTeleportSpeed` (outil « ballon au centre », appliqué
  entre deux ticks ; un seuil de distance seul couperait la traînée d'un coup de pied à 5 images/s) — et effacée à chaque
  match (`BallView.reset`) ; couleurs précalculées (`colors.ts`) dans PlayerView, ZoneView, ScrumView, CombatFxView.
- **Tests** : `tests/render/polish.test.ts` (fadeMath, estompage et axe du corps, halo et animations réduites, gerbes
  d'étincelles, éclat local, `forceSinglePass` sur toutes les vues, traînée, seuils de risque), `camera.test.ts` (pivot
  du porteur et retour exact sur la droite de tir, collision balayée sur toutes les formes de relief des deux terrains —
  l'ancienne version échouait à 0,67 m —, FOV de vitesse), `views.test.ts` (couleurs du risque), `inputLogic.test.ts`
  (esquive à l'enfoncement, mode figé, sprint automatique), `haptics.test.ts` (gestes, passe réussie), `feedback.test.ts`
  (« Passe réussie »). Vérification visuelle Playwright (coup d'envoi, défenseur dans l'axe du porteur à 6 / 12 / 20 m,
  joueur contre la caméra et entre la caméra et soi, halos des deux équipes, risque de passe, HUD en 900×600, 1280×720,
  1920×1080, pause à Échap / perte de focus à la manette, absence de fausses animations à la reprise).
- **Limites connues** : le tramage de l'alpha hash est visible (grain) sur un joueur à mi-opacité, surtout en basse
  résolution ; en regardant très haut sans ballon (> 45°), le joueur local reste en partie à l'écran avant de s'estomper ;
  le message « Passe réussie » couvre aussi une chandelle reprise par un coéquipier.

| Constante | Avant | Après | Pourquoi |
|---|---|---|---|
| `CAMERA_FOV_SPEED_GAIN` | 1,2 °/(m/s) | 3 | Le FOV s'ouvre au sprint, ne pulse plus à l'esquive |
| `CAMERA_CARRY_RAISE` (nouvelle) | — (0) | 1 m | Le porteur voit le défenseur devant lui |
| `KICKOFF_PITCH_DEG` (nouvelle) | — (0) | −8° | Plus de terrain, moins de ciel au coup d'envoi |
| `CARRIER_AUTO_SPRINT` (nouvelle) | — (non) | oui | Esquive du porteur sans latence au clavier |
| `GAMEPAD_RUMBLE_EFFECTS` | — | + `dodge`, `dive`, `passThrown`, `passCompleted`, `kick` | Retours des gestes du porteur |
| `STYLE.invulnScale` / `invulnOpacity` / `invulnPulse` / `invulnPulseRate` | 1,16 / 0,5 / 0,3 / 40 | 1,22 / 0,75 / 0,15 / 9 | Halo lisible, couleur d'équipe gardée, sous 3 Hz |
| `STYLE.sparkPoolSize` / `sparksPerHit` | 120 / 6 | 64 / 3 (+ `sparksPerPelletHit` 4) | Une gerbe par cible et par tick |
| `STYLE.tackleBurstLocalScale` (nouvelle) | — (1) | 0,5 | Éclat du plaquage subi moins envahissant |
| `STYLE.cameraFade*`, `lineFade*`, `localFade*`, `fade*Below` (nouvelles) | — | voir palette.ts | Estompage près de la caméra |
| `STYLE.maxPixelRatio` (nouvelle) | 2 en dur | 2 | Valeur visuelle sortie du code |


## 19. Passe finale : documentation, CI et contrôle final

| Fichier | Rôle |
|---|---|
| `README.md` | Présentation, lancement, déploiement statique (GitHub Pages, Cloudflare Pages), contrôles clavier ET manette, menus et réglages, paramètres d'URL de debug (vérifiés dans `launch.ts`), structure, liens. |
| `docs/TESTING.md` | Sommaire, section « Étape 1 — squelette », valeurs des tableaux vérifiées contre `constants.ts` (script qui évalue le module), section de la passe finale, aide-mémoire des 15 constantes du feeling. |
| `docs/ARCHITECTURE.md` | Mode d'emploi et sommaire, renvois sur les décisions reprises plus tard, §19, §20. |
| `src/sim/serialize.ts` | Commentaire : portée du déterminisme et du hash (même moteur JS). |
| `.github/workflows/ci.yml` | CI : Node 22, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, à chaque push et pull request. |
| `.github/workflows/pages.yml` | Déploiement de `dist/` sur GitHub Pages, **manuel** (`workflow_dispatch`). |

Décisions :

- **Docs = journal + état actuel** : les §7 à §18 restent un journal par étape (les mesures et les raisons d'un choix y
  gardent leur valeur), mais chaque passage repris plus tard porte un renvoi (« étape 7 : tir en cloche, §13 », « menu
  depuis l'étape 8 ; paramètre d'URL gardé pour le debug »…) ; les §1 à §6 décrivent l'état actuel. Corrigés à cette passe :
  paramètres d'URL décrits comme provisoires (§12, §13 : le menu existe, ils ne servent plus qu'au debug), demi des
  tourelles, mini-HUD de l'étape 5, portée du coup de pied (≈ 37 / 31 m mesurés avec `kickLaunch` + `predictBallLanding`),
  réglage du plaquage de l'étape 5 (repris au §15), bornes de rythme (§15 -> §17), hash « vérif. client/serveur » (§2, §20),
  écart entre niveaux de difficulté (§12 : le « au moins 15 % » n'est vrai que pour le cas testé).
- **CI** : `npm ci` (installation exacte du `package-lock.json`), Node 22 (Vitest 5 exige Node 22.12+, Vite 8 20.19+), cache
  npm de `actions/setup-node`, permissions `contents: read`, `concurrency` qui annule le run précédent de la même branche.
  Les étapes sont séparées (typecheck, tests, build) pour lire tout de suite laquelle échoue.
- **GitHub Pages manuel** : un prototype ne doit pas être republié à chaque push ; `workflow_dispatch` seulement. Le workflow
  refait `npm run check` avant de publier (jamais de build cassé en ligne). Permissions par job : build `contents: read` +
  `pages: read` (`configure-pages`), publication `pages: write` + `id-token: write` (`deploy-pages`), rien au niveau du
  workflow. Activation : *Settings → Pages → Source : GitHub Actions*, puis *Run workflow* (README). `base: './'` rend le
  build valable sous `/<dépôt>/` sans variable d'environnement.
- **Cloudflare Pages** : aucun fichier de configuration nécessaire (commande `npm run build`, dossier `dist`, `NODE_VERSION`
  22) : documenté dans le README plutôt qu'un `wrangler.toml` qui ne servirait qu'à ce cas.
- **Contrôle final** : `npm ci && npm run check` depuis un état propre (sans `node_modules` ni `dist`) : 37 fichiers de test,
  530 tests, svelte-check sans avertissement, build. Puis parcours Playwright (Chromium headless + SwiftShader, 1280×720) en
  trois passes : clavier / souris (`?debug&menu&duration=25` : choix à la souris, JOUER à l'Entrée, jeu, G, pause à Échap,
  Reprendre, fin de match, Rejouer, Quitter vers le menu en deux appuis, match de fond relancé), fausse manette
  (`?debug&menu&duration=20` : croix + A dans le menu, Start = jouer, stick, A, RT, View, RB, Start = pause / reprise, fin,
  Start = Rejouer, Quitter à la croix) et fausse manette sans `?debug` (Start lance la partie sans pointer lock, pause,
  Quitter) : 25 vérifications réussies, 0 erreur ni avertissement de console. Limite du banc de test, pas du jeu : sous
  SwiftShader (16–25 images/s), un appui simulé plus court qu'une image n'est pas vu par la lecture de la manette (une
  par image) ; le script maintient les boutons 350 ms.

## 20. Brancher le mode online

Objectif du cahier des charges : serveur autoritaire sur **Cloudflare Durable Objects**, **Firebase** pour l'authentification
et les lobbies, sans réécrire la simulation. Rien de tout cela n'est codé ; cette section dit ce qui est prêt, comment
l'assembler et ce qui reste à faire. Les mesures et constats d'audit sont au §17 (« Préparation au online »).

### Ce qui est déjà prêt

- **Simulation pure et portable** : `src/sim` et `src/bots` n'utilisent ni DOM, ni Node, ni horloge, ni aléatoire global
  (compilés par `tsconfig.sim.json` sans lib DOM, vérifiés par `tests/architecture.test.ts`) : ils s'importent tels quels dans
  un Worker. API : `createMatch(config)`, `step(state, inputs, TICK_DT)` (mutation en place, tick fixe de 30 Hz), `cloneState`,
  lectures pures (`queries.ts`). Coût mesuré : 0,08 / 0,12 ms par tick pour `step`, 0,21 / 0,46 ms pour les bots (3v3 / 5v5) —
  des dizaines de matchs par isolat.
- **État 100 % JSON** (`MatchState` : joueurs, ballon, projectiles, zones, mêlée, score, chrono, phase, `rng`), sans `-0`,
  `NaN` ni `undefined` (tests d'aller-retour) : il se stocke tel quel dans le stockage du Durable Object et s'envoie en snapshot.
- **Entrées réseau sûres** : `PlayerInput` = 5 nombres (`moveX`, `moveY`, `yaw`, `pitch`, `buttons`), **assainis** par la sim
  (valeurs non finies ignorées, déplacement borné, bits inconnus retirés, `-0` ramené à 0) : un client malveillant ne peut pas
  casser l'état. Une entrée manquante = entrée neutre ; répéter la dernière entrée ne crée pas de faux front montant (§2, §17).
- **Bots côté serveur** : `createBot(id, difficulté, seed, { externalIds })` renvoie un `InputProvider` (`(state, id) =>
  PlayerInput`) qui ne lit que l'état ; mémoire (`BotMemory`, PRNG propre) sérialisable, `botInput` / `createBotMemory`
  exportés pour la persister. `externalIds` = les humains (les bots se répartissent les rôles sans compter sur eux).
- **Joueurs humains n'importe où** : `MatchConfig.kickoffReceivers` (qui reçoit aux coups d'envoi), compositions `roles`
  libres, ids 0..2N−1 par équipe ; rien ne suppose « humain = joueur 0 » dans la sim ni dans les bots.
- **Client déjà découplé** : le rendu interpole entre deux `MatchState` (`prev`, `curr`, alpha) et ne lit la sim que par
  `'../sim'` ; la caméra du joueur local utilise le yaw / pitch courant de la souris (pas l'état) ; l'`InputManager` produit
  un `PlayerInput` par tick (`sample()`). Remplacer « `step` local » par « snapshots reçus » ne touche ni au rendu ni à l'UI.
- **Déterminisme** : même état + mêmes entrées => même état, au bit près **sur un même moteur** (V8 : Chromium, Node,
  workerd). Utile pour rejouer un match côté serveur (journal des entrées) et pour la prédiction client.

### Architecture cible

```
 Client (navigateur)                      Firebase                        Cloudflare
 ─────────────────────                    ─────────────────────           ─────────────────────────────────────
 Auth (anonyme / Google) ───────────────> Firebase Auth (ID token)
 Lobby : créer / rejoindre ─────────────> Firestore lobbies/{id}
   (taille, rôles, difficulté des bots)     (membres, état, matchId)
 « Lancer » ──── ID token ──────────────────────────────────────────────> Worker /match : vérifie le token,
                                                                           idFromName(lobbyId) -> Durable Object
 WebSocket <══ snapshots + événements ══════════════════════════════════> MatchRoom (Durable Object) :
           ══> { tick, input × 3 } à 30 Hz                                  MatchState, BotMemory[], dernières entrées,
                                                                           boucle à 30 Hz : bots + step
```

- **Firebase** : Auth donne l'identité (ID token JWT) ; Firestore tient les lobbies (membres, rôle choisi, prêt, taille,
  difficulté des bots de remplissage, `matchId` une fois lancé). Le Worker vérifie l'ID token (clés publiques de Google,
  vérification JWT standard) avant d'ouvrir la partie : Firebase n'est jamais sur le chemin du jeu en temps réel.
- **Durable Object `MatchRoom`** (un par match, adressé par `idFromName(lobbyId)` : tous les joueurs arrivent au même objet) :
  1. à la création : `createMatch({ teamSize, seed, roles, kickoffReceivers })`, un bot par place sans humain
     (`createBot(id, difficulté, seed, { externalIds: humains })`) ;
  2. boucle à pas fixe (accumulateur comme `FixedStepLoop`, minuterie de l'isolat tant que des joueurs sont connectés ;
     une alarme peut relancer l'objet s'il est évincé) : à chaque tick, entrées des humains = **dernière entrée reçue**
     (répétée si rien n'est arrivé), entrées des bots = `provider(state, id)` sur l'état AVANT le step, puis
     `step(state, inputs, TICK_DT)` ;
  3. diffusion d'un snapshot à chaque tick (ou un sur deux, 15 Hz) et des événements ;
  4. `state.phase === 'ended'` : résultat écrit dans Firestore (via l'API REST et un compte de service), puis l'objet se vide.
- **Client** : une variante réseau de `GameSession` garde `InputManager`, `Renderer`, HUD et menus ; elle envoie à chaque
  tick `{ tick, entrées des 2–3 derniers ticks }` (un appui bref — esquive, passe — survit à un paquet perdu) et affiche
  les snapshots avec un **tampon d'interpolation** (≈ 100 ms, 3 snapshots) : `interpolate.ts` entre les deux snapshots qui
  encadrent l'instant affiché, au lieu de `prev` / `curr` locaux.
- **Prédiction (plus tard)** : le client exécute `step` en local pour son propre joueur avec ses entrées non acquittées et
  se recale sur chaque snapshot (rejouer depuis l'état serveur + entrées non acquittées). Le snapshot fait **toujours**
  autorité : pas de comparaison de hash entre client et serveur (Safari / Firefox peuvent différer au dernier bit sur
  `Math.sin`, `cos`, `exp`, `atan2`, §17) ; les tirages aléatoires (rebonds, dispersion, tirage d'une mêlée) ne sont pas
  prédits (`rng` non envoyé aux clients), le recalage les corrige. Si un jour un lockstep entre navigateurs devenait
  nécessaire : remplacer ces fonctions par des approximations polynomiales en pur JS dans `vec.ts`.

### Ce qui resterait à faire

1. **Paquet serveur** (`server/`, Worker + Durable Object, `wrangler`), qui n'importe que `src/sim` et `src/bots` ; étendre
   `tests/architecture.test.ts` à ce dossier (pas d'import du client).
2. **Protocole** : messages `join`, `input`, `snapshot`, `events`, `match_end`, `ping` ; JSON d'abord, binaire plus tard.
3. **Format des snapshots** (sans toucher la sim) : `field` et `config` envoyés une fois (le client refait
   `createField(config.teamSize)`), pas de `rng`, deltas par rapport au dernier snapshot acquitté, quantification ;
   6,6 à 9,8 KB de JSON par tick aujourd'hui (≈ 2–2,5 KB gzip, §17).
4. **Journal d'événements** : `state.events` ne contient que le dernier tick ; le serveur tient `{ tick, events[] }` et envoie
   au client tout ce qui suit son dernier tick acquitté. Côté client, déclencher les transitions critiques par l'état
   (`phase` passée à `kickoff` -> caméra ; `ended` -> fin) plutôt que par les seuls événements.
5. **Session réseau côté client** (tampon d'interpolation, horloge serveur, acquittements), menu « en ligne » (lobby,
   connexion Firebase), gestion de la latence dans le HUD.
6. **Déconnexion** : répéter la dernière entrée quelques ticks, puis entrée neutre ; option « un bot reprend la place »
   (`createBot` pour cet id, `externalIds` mis à jour) et rendue à la reconnexion.
7. **Sécurité** : le serveur ignore tout sauf les `PlayerInput` (débit borné, un joueur ne pilote que son id) ; les outils de
   test (`debugGiveBall`, `debugResetBall`, `startPlayNow`) et le mode entraînement restent hors ligne ; pas de pause en ligne.
8. **Compensation de latence** : les projectiles sont testés contre les positions du tick précédent (§10), suffisant en local ;
   en ligne, le tireur voit les autres avec ≈ 100 ms de retard. À décider : rembobinage côté serveur (garder quelques états
   passés et tester le projectile contre l'image que voyait le tireur) ou balles un peu plus tolérantes.
9. **Persistance** : sauvegarder `MatchState` + `BotMemory[]` dans le stockage du Durable Object toutes les quelques secondes
   (reprise après éviction) ; journal des entrées pour rejouer un match (même moteur : hash identique).
10. **Tests** : boucle serveur en Node avec de faux clients (latence, pertes, déconnexions), replay déterministe d'un journal
   d'entrées, charge (nombre de matchs par isolat).

## 21. Personnages 3D (après la passe finale)

Les capsules sont remplacées, **côté rendu uniquement**, par des personnages animés. La hitbox de la sim reste la
capsule (`PLAYER_RADIUS`, `PLAYER_HEIGHT`, `playerHeight`) : aucune règle, aucun test de gameplay ne change.

- **Modèles** : Quaternius « Ultimate Modular Characters » (CC0, `public/models/CREDITS.md`). Les 11 personnages du pack
  partagent le même squelette et les mêmes 24 animations : `scripts/build-characters.mjs` produit un GLB par modèle
  (maillages, sans animations) et un `animations.glb` commun (squelette + 17 clips utiles), compressés meshopt.
- **Données** (`src/render/characters/characterDefs.ts`) : `CHARACTERS` (modèle par classe, échelle, tête agrandie
  pour une silhouette cartoon, forme de l'arme) et `SKINS`. Une skin = un modèle + une couleur par nom de matériau
  (fixe ou `{ team: 'main' | 'dark' | 'light' }`) + des nœuds à masquer ; chaque skin garde au moins une zone à la
  couleur de l'équipe (testé). Plus tard : mélange de parties entre modèles, accessoires, ou GLB faits sur mesure
  (même squelette => mêmes animations).
- **Chargement** (`CharacterLibrary`) : asynchrone, au démarrage du Renderer. Tant qu'un modèle n'est pas prêt ou si
  une classe n'en a pas (`CHARACTERS[role] = null`), `PlayerView` affiche la capsule ; il bascule tout seul dès que le
  modèle est chargé. Un échec de chargement laisse les capsules.
- **Animation** (`CharacterModel`, `animState.ts`) en couches : bas du corps = cycles de course mélangés selon la
  direction du déplacement par rapport au regard ; haut du corps = arme pointée / tir / bras libres du porteur ;
  corps entier = chute au plaquage (le relevé la rejoue à l'envers), célébration pendant la pause d'essai ; gestes
  ponctuels sur événements (passe, coup de pied, tir reçu). Retouches procédurales après le mixeur, par rotations
  exprimées dans le repère du personnage (indépendantes des axes des os) : buste et tête suivent le pitch, bras du
  porteur, genoux repliés en l'air, bascule en glissade / plongeon / esquive.
- **Rendu** : matériaux toon par instance (estompage en alpha hash, clignotement émissif), contour cartoon par maillage
  animé dupliqué poussé le long des normales après le skinning ; pendant l'invulnérabilité le contour s'épaissit à la
  couleur claire de l'équipe (remplace le halo de la capsule). Arme construite en code, placée au poignet droit et
  orientée selon la visée. Réglages visuels : `CHARACTER_STYLE` (palette.ts).
- **Phase A** (en cours de validation) : seul l'ailier (modèle Punk) a son personnage ; pilier et demi gardent la
  capsule jusqu'à la phase B.
