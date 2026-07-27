# Journal des mises à jour

## Patch 11 — Workflow d'exécution des deals, étape par étape (2026-07-27)

### Ajouts
- **Nouveau workflow multijoueur en 3 rôles pour l'exécution d'un deal M&A**, avec notification en temps réel envoyée au rôle suivant à chaque étape :
  1. **Analyste M&A** (page M&A) : choisit un taux et clique « Soumettre au Risque ».
  2. **Risk Manager** (page Conformité, joueur ou IA si personne n'est connecté après 90 secondes) : voit le dossier de crédit simulé (notation, levier, liquidité), ajuste le taux, puis Approuve ou Refuse. Un refus renvoie le dossier à l'analyste, qui peut le resoumettre.
  3. **Desk Structuration/Trading** (page Marchés) : dispose de 2 minutes chrono pour exécuter en Syndication ou en Couverture — au-delà, l'occasion est perdue et la santé de la banque encaisse une pénalité réelle.
  4. **RH / Direction Générale** (Vue d'ensemble) : voit l'impact direct sur le résultat net et la prime automatiquement répartie entre les 3 rôles ayant participé.
- Nouveau panneau « 💼 Dernières exécutions » sur Vue d'ensemble, et nouvelles priorités (dossiers en attente de validation Risque / exécutions en attente) dans le panneau Priorités déjà existant.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/handlers/dealWorkflow.js` (nouveau) porte l'intégralité de la machine à états (`deal.workflow.phase`), sur le même modèle de boucle auto-reprogrammée que le reste du jeu.
- Les pages Conformité et Marchés n'ont pas l'accès à la page M&A — `server/handlers/join.js` leur partage désormais `maDeals` en lecture seule spécifiquement pour ces panneaux de workflow, sans leur donner accès à la page M&A elle-même.
- Couverture vs Syndication : la Syndication cède plus d'économie du deal (40 % du fee net) contre un risque nul ; la Couverture en garde davantage (75 %) contre un coût de couverture implicite — un vrai arbitrage pour le Desk.

---

## Patch 10 — Moteur d'Événements Vivants (2026-07-26)

### Ajouts
- **Nouveau fil d'actualité 📰 sur Vue d'ensemble** : un canal général, visible par tous les joueurs quel que soit leur département, où apparaît une alerte toutes les 1 à 3 minutes sous forme de carte d'action.
- Trois types d'alertes, chacune avec un vrai effet de jeu :
  - **Alerte Marché** — un client du secteur Énergie veut lever 500 M$ en urgence : s'en saisir crée immédiatement un vrai mandat M&A bonus.
  - **Alerte RH** — le Head of Trading d'une banque concurrente est débauchable : s'en saisir l'embauche (effectif +1, prime de signature de 15 M$, moral en hausse).
  - **Alerte Risque** — une position du desk Trading dépasse la VaR autorisée : s'en saisir réduit à temps la plus grosse position ouverte (santé de la banque +3) ; ignorée, la VaR est réellement dépassée (santé -8).
- **N'importe quel joueur connecté peut s'en saisir en un clic**, premier arrivé premier servi — et si personne ne réagit, l'IA de veille finit par s'en charger pour les alertes Marché et RH (jamais pour l'alerte Risque, qui doit être traitée par un humain).

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/liveEvents.js` (nouveau) : boucle auto-reprogrammée indépendante (apparition 1-3 min, balayage 10-15s), même convention que toutes les autres boucles temporisées du jeu (garde pause, multiplicateur de difficulté).
- Le verrouillage d'une carte au moment du clic (`card.claimedByName`) est vérifié puis posé de façon synchrone, sans `await` entre les deux — deux joueurs qui cliquent presque simultanément ne peuvent jamais résoudre la même carte deux fois (vérifié par un test de course dédié).
- Distinct de `server/events.js` (crises/opportunités déjà existantes, propres à une page) : ce nouveau canal est volontairement global et page-agnostique, conforme à la demande d'un « canal général ».

---

## Patch 9 — Vrai desk de trading, pouvoir exécutif de la direction, planning RH (2026-07-26)

### Ajouts
- **Nouvelle page Marchés** (cluster Marchés Financiers/Trading FICC/Dérivés/Bureau Actions, et Direction Générale) : un vrai desk de trading partagé, avec 6 instruments (Actions Tech, Actions Industrielles, Obligations Souveraines, Pétrole Brent, EUR/USD, Actifs numériques) dont le cours évolue en continu. Achat/vente en un clic, positions ouvertes avec P&amp;L latent en direct, capital de trading dédié (8 Md$), résultat réalisé qui alimente le résultat net de la banque à chaque clôture de position. Ce cluster n'avait aucune page dédiée jusqu'ici — c'est corrigé.
- **Directive de la Direction Générale** : le CEO peut désormais désigner un département prioritaire pour toute la partie — ce département gagne +50 % de points sur toutes ses actions tant que la directive tient. Un vrai levier exécutif, pas juste un affichage : visible par tous via une bannière permanente, réglable depuis le panneau GM sur Comité de Direction.
- **Planning visuel des congés** sur la page RH : calendrier du mois en cours avec chaque jour de congé approuvé ou en attente affiché nommément — fini la simple liste, on voit d'un coup d'œil qui est absent quand.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/handlers/markets.js` (nouveau) suit exactement le même schéma que les autres boucles temporisées du jeu (auto-reprogrammation via `setTimeout`, garde `gameState.paused`, multiplicateur de difficulté) — les prix évoluent par marche aléatoire pondérée par la volatilité propre à chaque instrument.
- Les positions sont dimensionnées directement en notionnel M$ contre un prix indiciel (pas de quantité de titres à convertir) — le P&amp;L reste dans les mêmes unités que le reste de `financeKPIs`, sans conversion.
- La directive de la Direction Générale est appliquée au point de score unique (`awardPoints()`, `server/scoring.js`) via `player.cluster` — aucune logique dupliquée dans chaque handler métier.

---

## Patch 8 — Reprise d'une banque avec un vrai historique, et un cap clair (2026-07-26)

### Ajouts
- **Toute nouvelle partie démarre en pleine reprise d'entreprise**, pas d'une page blanche : 10 clients en portefeuille avec des mois/années de relation (notes datées, statuts variés, dont un client déjà « Inactif » et un dossier « En revue »), 7 projets M&A à tous les stades — dont 2 déjà clôturés sous la direction précédente, revenus déjà comptabilisés —, 6 alertes de conformité d'ancienneté variée (dont une déjà résolue et une déjà escaladée), un historique financier sur ~2 ans (8 points par indicateur au lieu de 5), 2 postes RH déjà ouverts, 2 demandes de congé en attente, un agenda et une base documentaire étoffés.
- **Premier dossier concret à régler** : les budgets départementaux hérités dépassent le pool disponible de 232 M$ — un vrai point de départ pour la nouvelle Finance, pas un chiffre en l'air.
- **Panneau 🧭 Priorités** sur Vue d'ensemble : liste calculée en direct (jamais scriptée) de ce qui a besoin d'attention — alertes conformité qui traînent, deals sans avancée, clients délaissés, postes à pourvoir, congés en attente, budgets dépassés, ratio de fonds propres bas, décision stratégique non soumise, tâches rapides en attente. Chaque ligne renvoie directement à la bonne page. Répond concrètement à « on ne sait pas quoi faire ».
- **Tutoriel de démarrage réécrit**, qui pose le cadre de la reprise d'entreprise et pointe explicitement vers le panneau Priorités comme point de départ.

### Retraits
- Aucun.

### Correctifs
- Corrigé : une fois le pool budgétaire dépassé, il était impossible de réduire un budget département pour revenir dans les clous (le contrôle rejetait même une baisse) — les réductions sont désormais toujours autorisées, seule une hausse au-delà du disponible est refusée.
- Corrigé : le texte de la page Finance affichait « 15 % — 40 % des revenus » pour le pool budgétaire trimestriel, alors que le taux réel est fixe à 40 %.

### Notes techniques
- `computePriorities()` (`public/js/pages/overview.js`) est une fonction pure calculée à chaque rendu à partir de l'état déjà présent côté client — aucune donnée serveur supplémentaire, et le filtrage par accès (`player.access`) empêche qu'un joueur voie une priorité sur une page qu'il ne peut pas ouvrir.
- `aumLegacyBase` recalculé pour rester cohérent avec les 10 nouveaux clients : AUM affiché (284 600 M$) = base hors portefeuille suivi (261 750 M$) + somme des clients « Actif » (22 850 M$).

---

## Patch 7 — Enjeux, progression et outils de partie (2026-07-26)

### Ajouts
- **Conformité** : audit trimestriel — les alertes laissées ouvertes trop longtemps coûtent une vraie amende (résultat net) et une pénalité de santé à chaque trimestre.
- **M&A** : un deal qu'on laisse stagner trop longtemps risque de tomber à l'eau tout seul ; nouvel événement « Enchère concurrente » — une banque rivale menace de rafler un deal si on ne le fait pas avancer à temps.
- **Clients** : risque de churn ambiant — un client actif délaissé trop longtemps peut basculer inactif de lui-même ; cross-sell — un client actif à fort AUM peut faire émerger une piste M&A bonus.
- **Score ESG** (page Comité de Direction) : jauge parallèle à l'objectif d'AUM, pilotée par les décisions du cluster Conformité/Risque/Juridique.
- **Historique des trimestres résolus** sur la page Comité de Direction.
- **Hall of Fame** : les meilleurs scores survivent désormais à une réinitialisation de partie, affichés sur Vue d'ensemble.
- **Badges de réussite** (🏅 Clôtureur, 🛡️ Bouclier, 🎯 Recruteur, 💰 Généreux, ⚡ Rapide), affichés à côté du nom partout où il apparaît.
- **Classement par département** sur Vue d'ensemble, en plus du classement individuel.
- **Panneau GM** (Direction Générale uniquement, sur Comité de Direction) : mettre la partie en pause/reprendre, prolonger le trimestre en cours de 60s, déclencher un événement manuellement, changer le mode de difficulté.
- **Modes de difficulté** (Détente / Standard / Intense) : ajustent la fréquence des événements, des tâches rapides et la durée des trimestres.
- **Notifications** : un petit message apparaît quand une tâche surgit sur une page où vous n'êtes pas ; l'onglet du navigateur clignote lors d'une crise tant qu'on n'y revient pas.
- **Tutoriel de démarrage** pour les nouveaux joueurs (affiché une seule fois).

### Retraits
- Aucun.

### Correctifs
- Corrigé : la bannière d'événement affichait la mauvaise icône pour un krach boursier (tombait dans le cas par défaut ⭐ au lieu d'une icône dédiée).
- Corrigé : un message `strategy:update` sans `quarterDecisions` (ex. après prolongation du trimestre ou reprise de pause) effaçait par erreur les décisions déjà affichées côté client.

### Notes techniques
- `server/difficulty.js` (nouveau) centralise les multiplicateurs de rythme — chaque boucle auto-reprogrammée (tâches, événements, risque de deal stagnant, risque de churn) lit `gameState.difficulty` à chaque tick plutôt que de dupliquer des constantes.
- Mettre la partie en pause fige l'action de chaque boucle temporisée (`gameState.paused` vérifié à chaque tick) sans jamais détruire de timer ; la reprise décale le compte à rebours du trimestre de la durée exacte de la pause.
- Les badges sont une fonction pure (`getBadges()`, server/scoring.js) des compteurs d'actions déjà suivis par `awardPoints()` — aucune logique de seuil dupliquée côté client.

---

## Patch 6 — Finance & RH réalistes et connectés au reste du jeu (2026-07-26)

### Ajouts
- **Finance : plus aucune saisie libre.** Les revenus et le résultat net ne se tapent plus à la main — ils proviennent désormais des vraies actions du jeu : chaque deal M&A clôturé génère des frais de conseil réels (2 % de la valorisation), et l'AUM total de la banque est recalculé en direct à partir de l'AUM des clients réellement passés « Actif » sur la page Clients.
- **Ratio de fonds propres (CET1)**, nouvelle jauge réaliste sur Finance et Vue d'ensemble : fonds propres / actifs pondérés du risque. Sous 8 %, la banque encaisse une pénalité de santé à chaque trimestre. Le choix stratégique « Position risquée » / « Couverture » du Comité de Direction fait varier les actifs pondérés du risque.
- **Pool budgétaire trimestriel contraint** (40 % des revenus) : allouer un budget à un département consomme réellement le pool commun — impossible d'allouer plus que ce qui reste disponible.
- **Décisions de capital** sur la page Finance : verser un dividende (réduit les fonds propres, rassure les actionnaires) ou renforcer les fonds propres (améliore le ratio CET1) — une décision par trimestre chacune.
- **RH : recrutement réaliste.** Le choix stratégique « Recruter » du Comité de Direction ouvre un vrai poste dans un département tiré au sort, avec deux candidats à interviewer avant de pouvoir embaucher — l'embauche coûte un salaire mensuel réel (déduit du résultat net) et augmente l'effectif recruté.
- **Répartition réelle des primes** : le pool de primes (10 % du résultat net) se distribue joueur par joueur par un responsable RH, dans la limite du pool disponible — chaque joueur voit sa prime perçue s'ajouter à son score.
- **Jauge de moral des équipes** : baisse quand des congés sont refusés, remonte avec les congés approuvés, l'intégration, les embauches réussies et les primes distribuées. Un moral trop bas (sous 40 %) pénalise légèrement la santé de la banque à chaque trimestre.

### Retraits
- Suppression du formulaire « Modifier un indicateur » sur Finance (édition libre de n'importe quelle valeur) — jugé peu réaliste, remplacé par les mécaniques ci-dessus.

### Correctifs
- Aucun bug connu des Patchs 1-5 corrigé dans ce patch — il s'agit uniquement d'ajouts et d'un retrait délibéré.

### Notes techniques
- `applyDealRevenue()` et `recomputeAum()` (`server/handlers/finance.js`) sont les nouveaux points de vérité pour revenus/AUM, appelés depuis `ma.js` (clôture de deal) et `clients.js` (changement de statut) — plus aucun champ financier n'est mutable arbitrairement.
- La croissance trimestrielle de l'AUM (décisions du Comité de Direction) s'applique désormais à `aumLegacyBase` (l'AUM hors portefeuille clients suivi) plutôt qu'à `aum` directement, pour ne jamais entrer en conflit avec le recalcul basé sur les clients.
- `awardCustomPoints()` (`server/scoring.js`) complète `awardPoints()` pour les montants variables (primes RH), avec un compteur `bonusEarned` séparé du score de jeu.

---

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
