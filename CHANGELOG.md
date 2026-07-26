# Journal des mises à jour

## Patch 5 — Modernisation graphique & tâches rapides continues (2026-07-26)

### Ajouts
- **Refonte visuelle complète** : nouveau thème sombre moderne (fintech) sur tout le jeu — fond profond, accents vert menthe / bleu / or, cartes et panneaux avec ombre et coins arrondis. Aucune structure ni logique n'a changé, uniquement l'habillage visuel.
- **File de tâches rapides** ("⚡ Tâches rapides") sur M&A, Clients, Conformité, RH et Finance : de petites tâches ponctuelles apparaissent en continu (toutes les 15 à 30 secondes) sur les pages opérationnelles, à traiter en un clic avant leur expiration (75 secondes) — de quoi toujours avoir quelque chose à faire, même entre deux crises ou deux trimestres.
- **Résumé des tâches en cours** sur Vue d'ensemble : compteur global + répartition par page, visible par tous.
- Chaque tâche traitée rapporte des points individuels, sans jamais pénaliser si elle expire — un levier d'activité purement positif, en complément des enjeux (crises, trimestres) déjà en place.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu des Patchs 1-4 corrigé dans ce patch — il s'agit uniquement d'ajouts.

### Notes techniques
- `server/tasks.js` (nouveau) suit le même schéma que `server/ai.js`/`server/events.js`/`server/strategy.js` : deux boucles `setTimeout` auto-reprogrammées indépendantes (apparition et balayage d'expiration), jamais `setInterval`.
- Diffusion scindée par page (`access:<page>`) comme le reste du jeu — une tâche Conformité n'est jamais visible par un joueur sans accès à Conformité.
- Thème : variables CSS centralisées dans `:root` (`public/css/style.css`), aucune classe renommée — la refonte ne touche que les valeurs, jamais le HTML généré par le JS.

---

## Patch 4 — Rounds stratégiques : le vrai cœur du jeu (2026-07-26)

### Ajouts
- **Comité de Direction** (nouvelle page) : le jeu avance par trimestres de 90 secondes. Chaque département (6 clusters opérationnels + Direction Générale) verrouille une décision stratégique à compromis visibles parmi 2-3 cartes — plus de formulaires, de vraies décisions avec de vrais compromis.
- **Objectif de campagne positif** : barre de progression vers 500 Md$ d'AUM (contre 284,6 Md$ au départ), affichée à côté de la santé de la banque sur Vue d'ensemble. Bannière de victoire + bouton "Nouvelle partie" quand l'objectif est atteint.
- **Interdépendance réelle entre joueurs** : Direction Générale voit en direct les choix réels déjà verrouillés par les autres départements avant de fixer son propre multiplicateur trimestriel (Croissance / Stabilité / Réduction des coûts) — tout le monde d'autre ne voit qu'un statut "soumis/en attente", jamais les choix des autres (mais toujours son propre choix).
- **Rythme accéléré** : dès que les 7 décisions du trimestre sont verrouillées, résolution immédiate (pas besoin d'attendre les 90 secondes) — sinon résolution automatique à l'échéance, avec option neutre appliquée à tout département non pourvu.
- Chaque trimestre résolu ajuste AUM, revenus, résultat net et santé de la banque selon la combinaison des 6 décisions + le multiplicateur de Direction Générale, avec un compte-rendu dans le fil d'activité.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu des Patchs 1-3 corrigé dans ce patch — il s'agit uniquement d'ajouts.

### Notes techniques
- `resolveQuarter()` (`server/strategy.js`) est une fonction quasi pure testée unitairement avec des jeux de décisions synthétiques, indépendamment de tout minuteur.
- Garde d'idempotence (`quarterPhase !== "deciding"` vérifié et modifié de façon synchrone) empêchant une double résolution du même trimestre entre le déclenchement immédiat (7 décisions soumises) et la boucle de balayage par échéance — troisième boucle indépendante du même principe que `server/ai.js`/`server/events.js`.
- Nouveau champ `player.cluster` (A-G) distinct de `player.access`, utilisé pour savoir quel département un joueur représente sur la page Comité de Direction.
- `buildDecisionsView()` construit une vue personnalisée par joueur (pas une simple diffusion de salle) : chacun voit son propre choix en clair, les autres redigés en statut, Direction Générale voit tout.

---

## Patch 3 — Couche jeu : score, santé de la banque, événements (2026-07-26)

### Ajouts
- **Score individuel** : chaque action significative (créer/faire avancer/clôturer un deal M&A, cocher une checklist DD ou un vote IC, créer un client, ajouter une note, cocher un item KYC, résoudre une alerte de conformité, approuver un congé, cocher un item d'intégration, créer une réunion, déposer un document, soumettre/approuver une note de frais) rapporte des points — uniquement aux transitions significatives, jamais en boucle sur un simple clic.
- **Classement** ("🏆 Classement") sur Vue d'ensemble, top 5 des joueurs par score.
- **Progression cosmétique** : badges de palier (🥉 Stagiaire, 🥈 Confirmé, 🥇 Senior, 💎 Légende) affichés à côté du nom partout où il apparaît — n'affecte jamais les accès par département.
- **Santé de la banque** ("Bank Health") : jauge collective 0-100 % sur Vue d'ensemble, affectée par les résolutions de crises, les clôtures de deals et les événements négatifs. À 0 % : faillite de la banque, bannière de fin de partie, bouton "Nouvelle partie" (réservé aux joueurs à accès complet) qui relance une partie fraîche sans déconnecter personne.
- **Événements & crises aléatoires** (`server/events.js`) : toutes les 4 à 8 minutes, un événement aléatoire parmi 4 se déclenche, avec bannière visible par tous :
  - *Contrôle réglementaire* — alerte de conformité urgente, à résoudre sous 3 min par un joueur ayant accès à Conformité.
  - *Client mécontent* — un client bascule en risque élevé, à traiter sous 3 min par un joueur ayant accès à Clients.
  - *Krach boursier* — choc instantané sur l'AUM et la santé de la banque, aucune résolution possible.
  - *Opportunité de marché* — deal M&A bonus à durée limitée, à saisir sous 3 min par un joueur ayant accès à M&A pour toucher un bonus de points et de santé.
  - Une crise non traitée à temps a une vraie conséquence négative (santé de la banque, statut client, alerte escaladée) — ce mécanisme crée un enjeu réel autour de la couverture des postes, pas juste un habillage de score.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu des Patchs 1-2 corrigé dans ce patch — il s'agit uniquement d'ajouts.

### Notes techniques
- Nouveau point d'entrée unique `awardPoints()` (`server/scoring.js`) pour tout le système de score, avec garde-fou anti-spam (points uniquement sur transitions false→true, jamais sur les clics répétés).
- Unicité prénom+nom ajoutée à la réservation de poste (`server/rooms.js`), indépendante du système grade+département, pour garantir des clés de score sans collision.
- `resetGame()` (`server/gameState.js`) reconstruit tout l'état métier en conservant la liste des joueurs connectés et leurs sessions Socket.io — aucune déconnexion nécessaire pour relancer une partie.
- Les boucles d'événements suivent le même principe que la boucle IA du Patch 2 (`setTimeout` auto-reprogrammé, pas `setInterval`).

---

## Patch 2 — Grosse mise à jour (2026-07-26)

### Ajouts
- **Interface visuelle** : avatars colorés (initiales), badges de département colorés, indicateur "🟢 X joueurs en ligne" dans la sidebar, cartes avec ombre légère, composant sparkline SVG réutilisable.
- **Finance** : sparklines sur l'historique de chaque indicateur, tableau budget vs réalisé par département (éditable).
- **M&A** : simulateur de valorisation DCF simplifié (sliders, calcul live), vote du comité d'investissement par deal.
- **Clients** : estimation automatique des revenus de frais (1,5 % de l'AUM), checklist KYC/onboarding par client.
- **Conformité** : assignation d'une alerte à un joueur connecté, badge d'ancienneté (SLA) coloré.
- **RH** : pool de bonus estimé (10 % du résultat net, réparti entre joueurs connectés), checklist d'intégration par joueur, tableau d'effectif par département.
- **IA ambiante** (`server/ai.js`) : si aucun joueur connecté n'a accès à une page (M&A, Clients, Conformité, RH, Finance) pendant au moins 2 minutes, une IA y effectue occasionnellement une petite action réaliste (avancer un deal, ajouter une note client, faire progresser une alerte, approuver un congé, ajuster un indicateur financier) — jamais en s'attribuant un dossier.
- **3 nouvelles pages** (accès universel) : Agenda (réunions partagées), Documents (dépôt partagé), Notes de frais (soumission + approbation réservée aux joueurs ayant accès à Finance, RH, ou un accès complet).

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu du Patch 1 corrigé dans ce patch — il s'agit uniquement d'ajouts.

### Notes techniques
- Refactorisation des handlers M&A/Clients/Conformité/RH/Finance pour extraire une fonction réutilisable par page (`advanceRandomDeal`, `addRandomClientNote`, `progressRandomComplianceItem`, `approveRandomLeaveRequest`, `nudgeRandomKPI`), appelée à la fois par les actions des joueurs et par la boucle IA.
- Nouvel outil de test `test_dom_shim.js` : exécute réellement les fonctions de rendu client (pas seulement une vérification de syntaxe) via un faux DOM minimal sous Node.
- Recherche et Wiki, envisagées pour ce patch, sont reportées à une prochaine mise à jour pour garder un périmètre raisonnable.

---

## Patch 1 — Version initiale (2026-07-18)

### Ajouts
- Création de personnage (prénom, nom, grade, département) avec réservation unique de poste.
- 7 pages synchronisées en temps réel : Vue d'ensemble, Mail, M&A, Clients, Conformité, RH, Finance.
- Accès filtré par département (7 clusters), avec accès complet automatique pour la Direction Générale et tout grade ≥ Managing Director.
- Déploiement sur Render avec lien permanent.
