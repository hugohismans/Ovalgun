# src/game

Colle côté client : boucle à pas fixe (30 Hz), assemblage des entrées (humain + bots),
appel de `step()`, alimentation du rendu (interpolation) et du HUD.

- `session.ts` : `GameSession(canvas, { teamSize, humanRole, seed, training, debug })` — `start()`, `stop()`,
  `dispose()`, `requestPlay()`, `setPaused()`, `onFrame(snapshot)`, `inputProviders` (point d'injection des bots :
  `InputProvider = (état, id) => PlayerInput`, déclaré dans `src/bots`).
- `loop.ts` : `FixedStepLoop` (pure, testée) — ticks par frame, rattrapage borné, alpha d'interpolation.
- `roles.ts` : composition des équipes au lancement.
- `feedback.ts` : retours texte temporaires (passe refusée, interception, plaquage).
- `combatHud.ts` : retours de visée du joueur local (hitmarker, direction des tirs reçus, vignette), purs et testés.
- Étape 5 : les adversaires sont pilotés par des tourelles d'entraînement (`src/bots/turret.ts`), passives avec
  `dummies: false` (`?dummies=off`).

Voir docs/ARCHITECTURE.md §8.
