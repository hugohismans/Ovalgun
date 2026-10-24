# Ovalgun : prototype solo contre bots

> Cahier des charges d'origine (fourni par le porteur du projet). Fait foi en cas de doute.
> Les décisions d'interprétation prises pour combler les ambiguïtés sont listées dans `docs/ARCHITECTURE.md`.

## Contexte
Je veux construire un jeu web arcade 3D : un rugby où chaque joueur porte une arme qui "plaque" à distance. Caméra épaule à la troisième personne, rythme rapide, style visuel coloré et flat (type Splatoon / Rocket League). Ce premier projet est un prototype SOLO contre des bots, mais l'architecture doit être prête pour un mode online plus tard (serveur autoritaire sur Cloudflare Durable Objects, Firebase pour auth et lobbies). Ne code pas le online, mais respecte strictement les contraintes d'architecture ci-dessous pour qu'il puisse se brancher sans réécriture.

## Stack
- Vite + TypeScript
- Three.js pour le rendu 3D
- Svelte 5 (runes) pour les menus et le HUD
- Pas de moteur physique externe : la physique est écrite à la main dans le module de simulation
- Déployable en statique (Cloudflare Pages ou GitHub Pages)

## Contrainte d'architecture n°1 (non négociable)
La simulation est un module pur, dans `src/sim/`, sans AUCUNE dépendance à Three.js, au DOM, à Svelte ou à `window`. Il doit pouvoir tourner tel quel dans un Cloudflare Worker.
- Tick fixe à 30 Hz. API du type `step(state, inputs, dt) -> state` (ou mutation en place, mais déterministe).
- Un joueur = une entrée `PlayerInput` par tick : direction de déplacement (vec2), orientation de visée (yaw/pitch), boutons (tir, saut, esquive, passe, coup de pied, capacité, sprint).
- L'état complet du match (`MatchState`) est sérialisable en JSON : joueurs, ballon, score, chrono, phase de jeu.
- Tout aléatoire passe par un PRNG seedé stocké dans l'état (jamais `Math.random`).
- Les bots sont des producteurs de `PlayerInput` comme un humain, dans `src/bots/`. Ils lisent le `MatchState` et renvoient une entrée. Ils ne touchent jamais à l'état directement.
- Le rendu (`src/render/`) lit l'état et interpole entre les deux derniers ticks. Le client humain produit un `PlayerInput` par tick depuis clavier/souris (`src/input/`).
- Toutes les constantes de gameplay (vitesses, cooldowns, dégâts, tailles de terrain, durées) sont dans un seul fichier `src/sim/constants.ts`, documentées, pour pouvoir itérer vite.

## Règles du jeu
Taille d'équipe paramétrable : 3v3 ou 5v5 (paramètre de match). Partie de 6 minutes.

### Terrain
Arène rectangulaire avec deux en-buts et une ligne médiane. En 3v3, le terrain fait environ 70 % de la taille du 5v5. Quelques éléments de relief simples (buttes, rampes, murets bas franchissables automatiquement) qui ne bloquent jamais la vue. Murs invisibles sur les bords.

### Ballon
Ovale, physique maison simple : gravité, rebonds avec une déviation pseudo-aléatoire seedée (le rebond d'un ballon ovale est imprévisible), friction au sol. Toujours visible : traînée, et le porteur a un marqueur au-dessus de la tête visible à travers les obstacles.
Quand le ballon est libre : un cercle au sol, le premier joueur qui entre dedans le prend.

### Le porteur du ballon
- Ne peut pas tirer.
- Légèrement plus rapide, cooldown d'esquive plus court.
- Passe : uniquement vers l'arrière (cône de 180° derrière lui). Visée assistée vers le coéquipier le plus pertinent dans le cône, trajectoire en cloche, interceptable par un adversaire qui traverse la trajectoire.
- Coup de pied : envoie le ballon loin devant, personne ne le porte, tout le monde court.
- Plongeon : dash avant court qui rend intouchable pendant 0,3 s, pour aplatir dans l'en-but.
- Il subit les tirs un peu plus fort que les autres (multiplicateur dans les constantes).

### Plaquage (pas de vie, pas de mort)
Chaque joueur a une jauge de stabilité. Chaque tir reçu la baisse. Elle remonte seule après 2 s sans être touché. Jauge vide : le joueur tombe, reste au sol 2,5 s, lâche le ballon s'il le portait, puis se relève sur place. Pas de respawn.

### Mouvement (tous les joueurs)
Rapide, arcade. Saut, glissade en courant, esquive (dash court avec cooldown), grimpe automatique sur les murets bas. Le feeling de courir avec le ballon doit être grisant.

### Rôles (choisis au lancement de la partie)
- Pilier : fusil à pompe courte portée, gros dégâts de stabilité. Capacité : bouclier frontal activable qui bloque les tirs. Le plus lent.
- Ailier : pistolet-mitrailleur faible mais précis, le plus rapide, double saut. Capacité : sprint boosté.
- Demi : lance-grenades à impact qui repousse les joueurs (knockback). Capacité : pose une zone de ralentissement au sol.
Pas de loadout, pas de munitions limitées, juste un rechargement. En 3v3 je conseille un de chaque rôle par équipe, en 5v5 les doublons sont autorisés.

### Phases de jeu
- Essai : franchir la ligne d'en-but adverse avec le ballon = 5 points. Puis remise en jeu : l'équipe qui a encaissé reçoit le ballon sur sa ligne, l'autre se replace derrière la médiane.
- Mêlée : si le ballon reste libre plus de 3 s avec au moins N joueurs de chaque camp dans un rayon donné (N = 2 en 3v3, 3 en 5v5), la zone devient une zone de capture : l'équipe qui a le plus de joueurs dedans après 3 s récupère le ballon.
- Dernière minute : cooldowns raccourcis et ballon légèrement plus rapide.

## Caméra et contrôles
Caméra épaule à la troisième personne, type Fortnite / Splatoon. Légèrement plus reculée quand on porte le ballon (on ne vise pas), plus proche quand on vise. ZQSD + souris (pointer lock), espace saut, shift esquive, clic gauche tir, clic droit visée, E passe, F coup de pied, A capacité. Prévoir un remapping simple plus tard.

## HUD (Svelte 5)
Score, chrono, jauge de stabilité du joueur, cooldowns, indicateur de rôle, mini-flèche vers le ballon quand il est hors champ. Menu de lancement : choix 3v3 / 5v5, choix du rôle.

## Bots
Comportement simple mais crédible, basé sur la lecture du MatchState :
- Sans ballon, en attaque : se placer en soutien derrière le porteur ou chercher l'espace devant.
- Porteur : avancer, esquiver quand sa stabilité baisse, passer en arrière si pressé, coup de pied si encerclé.
- En défense : converger vers le porteur et tirer, ou marquer le coéquipier le plus dangereux.
Ajouter un paramètre de difficulté (précision et temps de réaction).

## Ordre de travail
1. Squelette Vite + TS + Three.js + Svelte 5, structure de dossiers `sim / bots / render / input / ui`.
2. Module de simulation avec joueurs, mouvement, ballon et terrain. Tests unitaires sur la simulation (déterminisme : même seed + mêmes entrées = même état).
3. Rendu minimal : capsules colorées, ballon, terrain, caméra épaule, interpolation.
4. Porteur : passe arrière assistée, coup de pied, plongeon, ramassage du ballon libre.
5. Jauge de stabilité et plaquage, avec un seul rôle (ailier) pour valider le feeling.
6. Bots basiques, boucle de match complète (essai, remise en jeu, chrono, fin de partie).
7. Les deux autres rôles et la mêlée.
8. HUD et menu.

Après chaque étape, dis-moi quoi tester et quelles constantes toucher pour ajuster le feeling. Utilise des placeholders géométriques, pas d'assets. Priorité absolue : le feeling du porteur (courir, esquiver, passer) avant tout le reste.
