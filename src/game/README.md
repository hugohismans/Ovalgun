# src/game

Colle côté client : boucle à pas fixe (30 Hz), assemblage des entrées (humain + bots),
appel de `step()`, alimentation du rendu (interpolation) et du HUD.

- `session.ts` : `GameSession(canvas, { teamSize, humanRole, seed, training, debug })` — `start()`, `stop()`,
  `dispose()`, `requestPlay()`, `setPaused()`, `onFrame(snapshot)`, `inputProviders` (point d'injection des bots :
  `InputProvider = (état, id) => PlayerInput`, déclaré dans `src/bots`).
- `loop.ts` : `FixedStepLoop` (pure, testée) — ticks par frame, rattrapage borné, alpha d'interpolation.
- `roles.ts` : composition des équipes au lancement.

Voir docs/ARCHITECTURE.md §8.
