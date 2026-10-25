# src/game

Colle côté client : boucle à pas fixe (30 Hz), assemblage des entrées (humain + bots),
appel de `step()`, alimentation du rendu (interpolation) et du HUD.

- `session.ts` : `GameSession(canvas, { teamSize, humanRole, seed, training, debug, difficulty, passive, autopilot })` — `start()`, `stop()`,
  `dispose()`, `requestPlay()`, `setPaused()`, `onFrame(snapshot)`, `inputProviders` (point d'injection des bots :
  `InputProvider = (état, id) => PlayerInput`, déclaré dans `src/bots`).
- `loop.ts` : `FixedStepLoop` (pure, testée) — ticks par frame, rattrapage borné, alpha d'interpolation.
- `roles.ts` : composition des équipes au lancement.
- `feedback.ts` : retours texte temporaires (passe refusée, interception, plaquage).
- `combatHud.ts` : retours de visée du joueur local (hitmarker, direction des tirs reçus, vignette), purs et testés.
- `matchHud.ts` (étape 6) : HUD de la boucle de match (score, chrono, « 3, 2, 1, JOUEZ ! », bannière d'essai, dernière minute,
  écran de fin et statistiques), pur et testé. `GameSession.restart()` relance un match ; `installProviders()` installe les
  producteurs d'entrées (bots) à chaque match.
- Étape 6 (bots) : `installProviders()` crée un bot (`createBot` de `src/bots`) pour chaque joueur non humain, coéquipiers et
  adversaires, de difficulté `difficulty` (`?difficulty=facile|normal|difficile`), en leur indiquant le joueur humain
  (`externalIds` : ils se répartissent les rôles sans compter sur lui) ; `passive` (`?dummies=off`) : joueurs passifs ;
  `autopilot` (`?debug&autopilot`) : le joueur 0 aussi (match bots contre bots vu depuis sa caméra). Le joueur humain reçoit le
  ballon aux coups d'envoi de son équipe (`MatchConfig.kickoffReceivers`, hors autopilote).

Voir docs/ARCHITECTURE.md §8.
