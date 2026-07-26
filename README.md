# Blackwell & Co Capital — Multijoueur

Version multijoueur en temps réel du portail Blackwell & Co Capital. Chaque joueur crée un personnage (prénom, nom, grade, département) et rejoint une partie partagée — l'accès aux pages dépend du département choisi.

## Lancer en local

```bash
npm install
npm start
```

Puis ouvrez `http://localhost:3000` dans plusieurs onglets/navigateurs pour simuler plusieurs joueurs.

## Déployer sur Render (lien permanent pour vos amis)

1. Créez un dépôt GitHub avec ce dossier (`git init`, `git add .`, `git commit`, puis poussez sur GitHub).
2. Créez un compte sur [render.com](https://render.com) (connexion via GitHub la plus simple).
3. Cliquez sur **New +** → **Blueprint**, sélectionnez votre dépôt (Render détecte automatiquement `render.yaml`).
   - Ou **New +** → **Web Service** en configurant manuellement : build command `npm install`, start command `npm start`.
4. Une fois déployé, Render vous donne une URL du type `https://blackwell-multiplayer.onrender.com` — c'est ce lien qu'il faut partager avec vos amis.

### Limites du tier gratuit à connaître

- Le service se met en veille après ~15 minutes sans trafic ; la première requête suivante prend 30-60 secondes à réveiller le serveur — prévenez vos amis avant une session.
- L'état de la partie est en mémoire uniquement : il est perdu si le service redémarre ou si vous redéployez du code. Ne redéployez pas en pleine partie.
- Chaque partie est éphémère par conception — il n'y a pas de sauvegarde entre les sessions pour l'instant.

## Périmètre actuel (v1)

7 pages synchronisées en temps réel : Vue d'ensemble, Mail, M&A, Clients, Conformité, RH, Finance. L'accès à chaque page dépend du département choisi à la création du personnage (voir `server/departmentAccess.js`), avec accès complet automatique pour la Direction Générale et tout grade ≥ Managing Director.

Pas d'IA pour les postes non pourvus dans cette version — c'est une évolution prévue pour une prochaine étape.
