# Ovalgun — Mode en ligne

## Ce que fait le mode en ligne (version de test)

- **Serveur autoritaire** sur Cloudflare (Worker + Durable Objects, offre gratuite) : un salon = un Durable Object qui
  fait tourner la simulation et les bots à 30 Hz. Les navigateurs envoient leurs entrées (15 paquets/s) et reçoivent
  l'état 15 fois par seconde, qu'ils interpolent (environ 170 ms de retard d'affichage).
- **Salons par code** (5 caractères) : « Créer un salon » dans le menu, puis « Copier le lien d'invitation » ; les potes
  ouvrent le lien et arrivent directement dans le salon (ou tapent le code dans « Rejoindre »).
- Dans le salon : chacun choisit son équipe et son rôle ; l'hôte (le créateur) choisit 3v3 / 5v5 et la difficulté des
  bots qui complètent les équipes, puis lance la partie. Jusqu'à 10 joueurs humains (5v5). À la fin du match, retour au
  salon pour la revanche. Un joueur qui part en cours de match est remplacé par un bot.
- Pas encore de comptes ni de liste de salons publique (Firebase, plus tard) : on joue entre amis avec le lien.
- Pas encore de prédiction côté client : tes déplacements s'affichent avec le ping + ~170 ms (la caméra, elle, suit la
  souris sans retard). Suffisant pour tester ; la prédiction est la prochaine étape si le ressenti l'exige.

## À faire une fois (≈ 10 minutes)

1. **Compte Cloudflare** gratuit : https://dash.cloudflare.com/sign-up
2. Dans le tableau de bord : **Compute (Workers) → Workers & Pages**. La première fois, Cloudflare demande de choisir
   un **sous-domaine `workers.dev`** (par exemple `hugo`) : choisis-le (le serveur sera à
   `https://ovalgun-server.<sous-domaine>.workers.dev`).
3. **Jeton d'API** : icône de profil (en haut à droite) → **Profile → API Tokens → Create Token** → modèle
   **« Edit Cloudflare Workers » → Use template** → *Account Resources* : ton compte ; *Zone Resources* : All zones →
   **Continue to summary → Create Token**. Copie le jeton (il ne s'affiche qu'une fois).
4. **Account ID** : sur la page **Workers & Pages** (colonne de droite « Account ID »), ou dans l'URL du tableau de bord
   (`dash.cloudflare.com/<account id>/...`). Copie-le.
5. **Secrets GitHub** : dépôt `hugohismans/Ovalgun` → **Settings → Secrets and variables → Actions → New repository
   secret**, deux fois :
   - `CLOUDFLARE_API_TOKEN` = le jeton de l'étape 3 ;
   - `CLOUDFLARE_ACCOUNT_ID` = l'identifiant de l'étape 4.
6. **Déployer** : **Actions → Déploiement GitHub Pages → Run workflow** (branche `main`). Le workflow déploie le serveur,
   puis le site avec l'adresse du serveur intégrée. L'adresse du serveur apparaît dans le résumé du workflow.

Ensuite, chaque déploiement (même workflow) met à jour le serveur et le site ensemble.

## Jouer

1. Ouvre https://hugohismans.github.io/Ovalgun/ , écris ton pseudo dans « En ligne », clique **Créer un salon**.
2. **Copier le lien d'invitation** et envoie-le (Discord, WhatsApp…).
3. Quand tout le monde est là : choisissez équipes et rôles, l'hôte clique **Lancer la partie**.

Conseils : Chrome / Edge / Firefox récents ; une manette marche comme en solo ; si quelqu'un voit « Version du jeu
différente », il recharge la page (Ctrl+F5).

## Limites de l'offre gratuite Cloudflare

Largement suffisantes pour des soirées de test : environ 100 000 « requêtes » Durable Objects par jour (les messages
WebSocket comptent pour 1/20), soit plusieurs heures de jeu à 6 joueurs par jour. Si la limite est atteinte, le serveur
refuse les connexions jusqu'au lendemain (rien n'est facturé sur l'offre gratuite).

## En local (développement)

```bash
npm run server:dev                       # serveur sur http://localhost:8787
npm run dev                              # jeu sur http://localhost:5173
# puis ouvrir http://localhost:5173/?server=http://localhost:8787 (dans deux onglets pour jouer à deux)
```
