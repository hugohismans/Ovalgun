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
        │  └──> input ──> sim (types/constants)
        └────> bots ────> sim
```

`sim` n'importe rien hors de `src/sim`. `bots` n'importe que `src/sim` (et `src/bots`).
Le test `tests/architecture.test.ts` et `npm run typecheck` (tsconfig.sim.json) font respecter ces règles.

## 2. Contrat de la simulation

API publique (`src/sim/index.ts`) :

```ts
createMatch(config: MatchConfig): MatchState
step(state: MatchState, inputs: InputFrame, dt?: number): MatchState // mute en place ET renvoie le même objet
cloneState(state: MatchState): MatchState                              // copie profonde (JSON-safe)
NEUTRAL_INPUT, Buttons, constantes, types…
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
- Une entrée manquante pour un joueur = entrée neutre qui conserve son yaw/pitch courant.

Ordre des opérations dans `step` (à respecter et documenter dans `match.ts`) :

1. `events = []`, `tick++`.
2. Phase : décompte `kickoff` -> `play` ; décompte `try` -> remise en jeu.
3. Pour chaque joueur (ordre des ids) : lecture de l'entrée, fronts montants (`buttons & ~lastButtons`), yaw/pitch (pitch borné).
   En `kickoff`/`try`/`ended` : seule la visée est appliquée (joueurs figés).
4. Minuteries (cooldowns, statut down/getting_up, invulnérabilité, recharge).
5. Actions : capacité, actions du porteur (passe, coup de pied, plongeon), tir (création de projectiles).
6. Déplacement : esquive / glissade / plongeon / saut / course, gravité, terrain (marche, grimpe), murs invisibles, séparation entre joueurs.
7. Projectiles : déplacement balayé, collisions joueurs / boucliers / terrain -> dégâts, explosions, knockback.
8. Stabilité : plaquages (statut down, lâcher du ballon), régénération.
9. Ballon : suit le porteur, ou physique (gravité, rebonds seedés, frottement), puis ramassage / réception / interception.
10. Zones (ralentissement), mêlée.
11. Règles : essai, chrono, dernière minute, fin de match.
12. `lastButtons = buttons`.

## 3. Repère, angles, visée

Voir l'en-tête de `src/sim/vec.ts`.
- Y vers le haut, terrain dans le plan XZ. L'équipe 0 attaque vers **+Z**, l'équipe 1 vers **-Z**.
- `forward(yaw) = (sin yaw, 0, cos yaw)`, `right(yaw) = (-cos yaw, 0, sin yaw)`. Souris vers la droite => yaw diminue.
- **Origine de visée** = pieds + `AIM_ORIGIN_HEIGHT` vers le haut + `SHOULDER_OFFSET` vers `right(yaw)`.
  Les tirs partent de ce point selon `aimDir(yaw, pitch)`. La caméra épaule se place sur la MÊME droite, en arrière :
  `camPos = aimOrigin - aimDir * distance`. Le tir part donc exactement vers le réticule, à toute distance, sans que la sim
  connaisse la caméra. (Si la caméra est rapprochée par une collision, elle reste sur cette droite.)

## 4. Interprétations du cahier des charges (décisions)

- **Shift** : appui = esquive (bouton `DODGE`), maintien = sprint (`SPRINT`), comme « tap to dodge / hold to sprint ».
  Le client met `DODGE` au front d'appui et `SPRINT` tant que la touche est maintenue (après ~0,15 s).
  Sprint : uniquement en avançant ; empêche de tirer ; annulé par la visée.
- **Glissade** : touche **C** en courant (`SLIDE`). Pour le porteur, **C = plongeon**.
- **Touches** : on lit `KeyboardEvent.code` (position physique) pour que ZQSD/A sur AZERTY = WASD/Q sur QWERTY.
  Défaut : avancer `KeyW`(Z), gauche `KeyA`(Q), reculer `KeyS`, droite `KeyD`, saut `Space`, esquive/sprint `ShiftLeft`,
  glissade/plongeon `KeyC`, passe `KeyE`, coup de pied `KeyF`, capacité `KeyQ`(A), tir clic gauche, visée clic droit,
  rechargement `KeyR` (bouton `RELOAD`). Jamais de Ctrl (Ctrl+W ferme l'onglet).
- **Manette** (Gamepad API, disposition « standard » Xbox/PlayStation), mapping par défaut :
  | Contrôle | Action |
  |---|---|
  | Stick gauche | déplacement (zone morte radiale `GAMEPAD_MOVE_DEADZONE`) |
  | Clic stick gauche (L3) | sprint (bascule ; s'annule quand le stick revient au centre, en visée ou au tir) |
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
- **Passe** : en cloche vers la position anticipée du receveur ; tout joueur (coéquipier OU adversaire) à portée de la
  trajectoire attrape le ballon (interception). Le passeur ne peut pas rattraper pendant `PASS_PICKUP_BLOCK_SEC`.
- **Essai** : le porteur franchit la ligne d'essai adverse (pas besoin d'aplatir). Le plongeon sert à franchir les derniers mètres invulnérable.
- **Remise en jeu** : l'équipe qui a encaissé est placée `KICKOFF_RECEIVE_OFFSET` devant sa ligne d'essai, ballon donné au joueur le plus central ;
  l'autre équipe derrière la médiane (`KICKOFF_DEFEND_OFFSET`). Joueurs figés `KICKOFF_FREEZE_SEC`. Coup d'envoi initial : `FIRST_KICKOFF_TEAM`.
- **Fin du match** : à 0 au chrono, immédiatement. Égalité possible.
- **Armes** : toutes à projectiles (rapides pour SMG/pompe, balistiques pour grenades). Visibles, esquivables, déterministes.
  Pas de tir ami. Le porteur ne tire pas. Sprint, bouclier levé, au sol : pas de tir.
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

## 6. Vérification

- `npm run typecheck` : tsc sur sim+bots sans DOM, puis svelte-check sur tout le projet.
- `npm test` : vitest (déterminisme, physique, règles, bots, architecture).
- `npm run build` : build statique dans `dist/`.
- `npm run check` : les trois.
