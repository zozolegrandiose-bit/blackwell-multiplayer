# Journal des mises à jour

## Patch 29 — Marchés Macro Multi-Actifs (1/5, mega-update V2.0 ULTRA) (2026-07-31)

Premier volet d'une mega-update en 5 patches (29-33) couvrant les nouveaux systèmes demandés qui n'existaient pas encore (moteur macro multi-actifs, rang/réputation RPG, Private Equity/LBO, God Mode admin, cybersécurité). Plusieurs des 10 piliers demandés étaient déjà couverts en profondeur par des patchs précédents (négociation M&A/War Room, Wealth Management, Bâle/régulateur, délits d'initiés, IA collègues/guerre inter-banques, League Tables) — pas retravaillés ici pour éviter de dupliquer l'existant.

### Ajouts
- **9 nouveaux instruments nommés** : Indices (S&P 500, NASDAQ, CAC 40, Nikkei 225), Devises (GBP/USD, USD/JPY, en plus de l'EUR/USD existant), Taux (Bund Allemand 10Y, en plus de US 10Y/Euribor), Matières Premières (Or, Gaz Naturel, en plus du Brent) — tradeables exactement comme les instruments existants (`markets:buy`/`markets:sell`).
- **Moteur de corrélation macro étendu** : une décision de la Fed fait chuter le S&P 500 et le NASDAQ (plus sensible, technologique), renforce le dollar (GBP/USD baisse, USD/JPY monte), fait chuter l'or ; une décision de la BCE fait chuter le CAC 40 et bouge le Bund directement comme les autres taux ; l'EUR/USD réagit aux deux à la fois (une hausse Fed ET BCE de même ampleur s'annulent quasiment).
- **Carnet d'ordres Niveau 2** sur la page Marchés : profondeur Bid/Ask à 3 niveaux par instrument, affiché sous chaque sparkline.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- Le carnet d'ordres Niveau 2 est une fonctionnalité d'affichage pure, synthétisée côté client à partir du prix et de la volatilité de chaque instrument — aucun nouvel état serveur, aucun changement au mécanisme d'exécution `markets:buy`/`markets:sell`.
- Testé : moteur de corrélation (10 assertions unitaires avec Math.random forcé pour un scénario de hausse Fed+BCE simultanée), rendu du carnet d'ordres (6 assertions DOM), régression live (17 instruments présents dans le snapshot et le ticker global, achat/vente fonctionnel sur un nouvel instrument, position persistée).

## Patch 28 — Recrutement DRH & Sièges Assignés (4/4) (2026-07-31)

Dernier volet de la restructuration entamée aux Patchs 25-27. Jusqu'ici, un compte approuvé se retrouvait quand même face à l'ancien écran de création de personnage (prénom/nom/grade/département libres, à choisir soi-même). Ce patch termine le raccordement : le poste vient désormais du compte (assigné par le Super-Admin ou par la DRH), et le joueur retrouve le même personnage à chaque connexion au lieu d'en recréer un.

### Ajouts
- **Sièges auto-assignés** : à la connexion, le joueur est placé directement à son poste (département/grade/salaire tels qu'approuvés) — plus d'écran "créez votre personnage". La contrainte "un seul joueur par couple grade+département" a été retirée : dans une banque de 300 000 collaborateurs, plusieurs personnes peuvent légitimement porter le même titre.
- **Personnage persistant** : chaque compte a désormais une identité de joueur stable (liée à son compte, plus à un identifiant temporaire régénéré à chaque connexion). Une reconnexion (rafraîchissement de page, perte de réseau, nouvel onglet) retrouve exactement le même personnage — mails, historique d'activité, humeur, stress, fidélité, compétence et intégration compris — au lieu de repartir de zéro. Deux onglets ouverts simultanément sur le même compte partagent le même personnage sans le dupliquer.
- **Onglet "Recrutement International" (module DRH)** : affiche le nombre de candidatures reçues (site Carrières, Patch 27) par département et par filiale, avec un bouton **Convertir en Employé** par candidature — la DRH choisit département/grade/entité/salaire, un compte est créé et immédiatement approuvé, un mot de passe temporaire est généré et affiché une fois à l'écran RH pour être transmis au candidat.

### Retraits
- L'écran de création de personnage libre (prénom/nom/grade/département au choix) — remplacé par l'assignation de poste.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts/retraits ce patch.

### Notes techniques
- Le compte (`server/db.js`, département/grade/salaire assignés) reste la source de vérité pour le poste d'un joueur : une promotion ou réaffectation faite en jeu (Organigramme RH, augmentation) écrit désormais aussi dans le compte, pour qu'une reconnexion ne revienne pas en arrière sur une promotion déjà accordée en jeu.
- Le reste de l'état de jeu d'un joueur (satisfaction, stress, fidélité, compétence, intégration, statuts temporaires) est sauvegardé dans un nouveau fichier `data/playerRecords.json`, même compromis honnête déjà assumé pour `data/accounts.json` et `data/history.json` : survit aux redémarrages du même déploiement, pas à un redéploiement Render (nouveau disque).
- Comme pour les transferts/promotions faits depuis le Panel Admin (Patch 26), un changement d'affectation par la DRH ou l'admin prend effet à la prochaine reconnexion du joueur concerné, pas instantanément sur une session déjà ouverte — cohérent avec le comportement déjà en place pour une révocation de compte.
- Régression complète rejouée : siège auto-assigné avec le bon grade/département/salaire, reconnexion qui restaure le même identifiant de joueur et l'historique de mails, promotion en jeu qui survit à une reconnexion (au lieu d'être écrasée par l'affectation d'origine), flux complet candidature → conversion en employé → connexion immédiate avec le mot de passe temporaire, rejets (candidature déjà convertie / introuvable), et un second onglet qui réutilise le même personnage sans le dupliquer.

## Patch 27 — Site Vitrine Institutionnel & Carrières (3/4) (2026-07-31)

Troisième volet de la restructuration entamée aux Patchs 25-26. Le site public à `/` n'était jusqu'ici qu'un placeholder ; il devient une véritable vitrine institutionnelle inspirée des grandes banques mondiales, avec un moteur de recherche d'offres et un formulaire de candidature réellement connecté au Panel Admin.

### Ajouts
- **Navigation complète** : À Propos, Nos Métiers, RSE & Impact, Carrières, Presse & Insights, plus le bouton "Accès Intranet / Portail Employé" — partagée sur toutes les pages du site public via un chrome commun (`public/site/site.js`).
- **Page d'accueil enrichie** : ticker boursier décoratif (indices mondiaux + action Blackwell, simulé côté client, sans dépendance serveur), section "Nos Piliers" (CIB, Markets & Execution, Asset & Wealth Management, Commercial Banking), section "Actualités & Insights".
- **Nouvelles pages** : À Propos (`/about`), Nos Métiers (`/solutions` — Conseil M&A, Levée de Capitaux, Sales & Trading, Produits Structurés, Restructuration de dette), RSE & Impact (`/csr`), Presse & Insights (`/press`).
- **Carrières (`/careers`)** : présentation de la culture d'entreprise et des programmes Graduate/Summer Analyst, moteur de recherche d'offres (filtres filiale/département/niveau + recherche texte) sur un catalogue de 34 offres fictives réparties dans 7 villes (New York, Londres, Paris/Francfort, Hong Kong, Singapour, Tokyo, São Paulo), formulaire de candidature dynamique en modal.
- **`server/jobs.js`** (nouveau) : catalogue d'offres statique + routes publiques `GET /api/jobs`, `GET /api/jobs/:id`, `POST /apply` — une candidature crée immédiatement une entrée visible dans la section "Candidatures" du Panel Admin (Patch 26), confirmée par test de bout en bout.

### Retraits
- Le texte "site institutionnel à venir" du placeholder du Patch 25.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- Les 7 villes des offres d'emploi restent volontairement distinctes des 4 entités réelles du Global Footprint utilisées par le Panel Admin (Patch 26) : une offre d'emploi est un texte d'ambiance, pas une entité de jeu pilotable — voir la note technique du Patch 26 à ce sujet.
- `server/jobs.js` est monté sans garde d'authentification (routes publiques), à l'inverse de `server/admin.js` : leçon tirée du bug de routage corrigé en urgence au Patch 26 (`router.use(middleware)` sans préfixe de chemin s'applique à toutes les requêtes qui transitent par ce routeur, pas seulement à ses routes définies).
- Régression complète rejouée : les 8 pages publiques, l'API `/api/jobs`, le flux de candidature (`POST /apply`), le rejet d'une candidature incomplète, et la visibilité de la nouvelle candidature dans `/api/admin/overview` après connexion Super-Admin.

## Patch 26 — Panel Administrateur (2/4) (2026-07-31)

Deuxième volet de la restructuration comptes/accès entamée au Patch 25. Le Super-Admin dispose désormais d'une interface dédiée pour traiter les demandes de compte, affecter les joueurs et gérer les accès dans le temps — jusqu'ici, un compte approuvé côté base de données n'avait encore aucun moyen d'être approuvé depuis l'application elle-même.

### Ajouts
- **Panel Admin (`/admin`)** : accessible uniquement au compte Super-Admin (redirection `/login` sinon, 403 sur les appels API). Trois sections : demandes en attente, ensemble des comptes, candidatures Carrières (lecture seule pour l'instant — la conversion en employé arrive au Patch 28 avec le module DRH).
- **Approuver & Assigner** : depuis une demande en attente, l'admin choisit le Département, le Grade, l'Entité géographique et le Salaire de départ avant validation — le compte passe alors `APPROVED` et peut se connecter.
- **Rejeter** une demande en attente.
- **Modifier / Transférer** : promotion ou changement d'affectation (département, grade, entité, salaire) à tout moment pour un compte déjà approuvé, sans repasser par le circuit d'approbation.
- **Révoquer** l'accès d'un compte à tout moment (bloque immédiatement toute nouvelle connexion). Le compte Super-Admin ne peut jamais être révoqué.
- **Entités géographiques** : le menu d'affectation reprend les 4 entités régionales réelles du Global Footprint (New York, Francfort/Blackwell SE, Hong Kong, Londres — Patch 19), plutôt que la liste plus large de villes prévue pour les offres d'emploi du site vitrine (Patch 27), afin qu'une affectation corresponde toujours à une entité effectivement pilotable dans le jeu.

### Retraits
- Aucun.

### Correctifs
- **Bug critique corrigé en urgence après le premier déploiement de ce patch** : le routeur admin (`server/admin.js`) appliquait sa garde `requireSuperAdmin` à **toutes** les requêtes de l'application (pas seulement `/api/admin/*`), car il était monté sans préfixe de chemin. Conséquence en production : `/`, `/login`, `/register` et les fichiers statiques du site redirigeaient tous vers `/login`, bloquant entièrement les nouvelles inscriptions et connexions. Corrigé en montant le routeur sous `/api/admin` avec des chemins de route relatifs, plus un correctif connexe dans `server/auth.js` (`requireApproved` utilisait `req.path`, qui perd son préfixe une fois dans un sous-routeur monté — remplacé par `req.originalUrl`). Régression complète rejouée après coup (site public + panel admin) avant redéploiement.

### Notes techniques
- `server/admin.js` (nouveau) : routes Express classiques sous `/api/admin/*` (`overview`, `approve`, `reject`, `revoke`, `update-assignment`), toutes gardées par `requireSuperAdmin` (Patch 25) — même logique que `server/auth.js`, pas d'événements Socket.io pour des actions ponctuelles.
- `public/site/admin.html` (nouveau) : page autonome (script inline, appels `fetch`), même style que `login.html`/`register.html`.
- Régression complète en direct contre le serveur réel (19 assertions HTTP) : connexion Super-Admin, inscription puis apparition dans les demandes en attente, refus d'approbation sans affectation complète, approbation puis connexion réussie, accès admin refusé à un compte non-admin (403), promotion/transfert, révocation puis connexion bloquée, refus de révoquer le Super-Admin, rejet puis connexion bloquée, page `/admin` protégée.

---

## Patch 25 — Fondations Comptes & Authentification (1/4) (2026-07-30)

Premier volet d'une restructuration en 4 patches transformant le point d'entrée du site : d'un accès multijoueur instantané (n'importe qui rejoint librement) vers des comptes persistants approuvés par un Super-Admin unique. Ce patch pose les fondations techniques (base de comptes, authentification, séparation des routes) ; le panel Admin (Patch 26), le site vitrine complet (Patch 27) et l'intégration DRH/gameplay (Patch 28) suivent.

### Ajouts
- **Comptes persistants** : inscription (`/register`) avec Prénom, Nom, Email, Mot de passe, Département et Grade visés — statut par défaut `PENDING_APPROVAL`, bloqué tant qu'un administrateur ne l'a pas approuvé.
- **Authentification** : connexion (`/login`) par email/mot de passe, mots de passe hashés (bcrypt), session persistante (30 jours).
- **Séparation stricte des routes** : le jeu (anciennement à la racine) déménage sous `/app/*`, désormais protégé — seul un compte connecté ET approuvé peut charger le Terminal ou établir une connexion de jeu en temps réel. `/`, `/login`, `/register` restent publics (page d'accueil institutionnelle minimale en attendant le site vitrine complet du Patch 27).
- Page d'accueil publique minimale avec chiffres clés ($3.8T d'actifs, 300 000+ collaborateurs, 100+ pays) et lien vers le Portail Employé.

### Retraits
- **L'ancien accès multijoueur instantané (n'importe qui rejoint librement en choisissant un poste) est retiré.** Tout nouveau joueur doit désormais créer un compte et attendre l'approbation de l'administrateur avant de pouvoir jouer — un changement de comportement volontaire et assumé, demandé explicitement, mais qui mérite d'être noté clairement : la spontanéité "on se connecte et on joue tout de suite" n'existe plus tant qu'un compte n'a pas été approuvé.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/db.js` (nouveau) : comptes et candidatures stockés dans un fichier JSON local (`data/accounts.json`), même compromis honnête déjà assumé pour l'historique de partie (`server/persistence.js`, Patch 18) — survit aux redémarrages dans le même déploiement Render, mais pas à un redéploiement complet (nouveau disque éphémère). Une vraie base de données managée nécessiterait un service payant que l'utilisateur devrait provisionner lui-même.
- `server/auth.js` (nouveau) : routes Express classiques (`POST /register`, `POST /login`, `POST /logout`, `GET /api/me`), pas des événements Socket.io — ce sont des actions ponctuelles, pas de l'état de partie en temps réel. `requireApproved`/`requireSuperAdmin` sont des middlewares réutilisables pour toute route protégée à venir (panel Admin du Patch 26 notamment).
- `server/sessionMiddleware.js` (nouveau) : une seule instance d'`express-session` partagée à la fois par Express (`app.use`) et par la connexion Socket.io (`io.engine.use`, technique standard pour lier une socket à la session HTTP qui l'a ouverte) — une connexion de jeu sans session valide et approuvée est immédiatement déconnectée (`socket.disconnect(true)`).
- **Action requise côté utilisateur (une seule fois)** : définir `SUPERADMIN_EMAIL` et `SUPERADMIN_PASSWORD` dans les variables d'environnement Render (Dashboard → Environment) avant le premier déploiement de ce patch — le compte Super-Admin (statut `APPROVED`, accès complet) est créé automatiquement au démarrage du serveur si ces deux variables sont présentes et qu'aucun Super-Admin n'existe encore. Sans elles, aucun compte n'a accès tant que le panel Admin (Patch 26) n'existe pas.
- `public/index.html`/`public/js/*`/`public/css/*` déplacés vers `public/app/` (chemins d'assets rendus relatifs plutôt qu'absolus, pour rester corrects sous n'importe quel point de montage) ; `public/site/*` (nouveau) héberge la page d'accueil, `/login` et `/register` en attendant le site vitrine complet.
- Régression complète menée en direct (HTTP + `socket.io-client`) : `/`, `/login`, `/register` publics (200), `/app` sans session (redirection 302), inscription réussie avec mot de passe hashé, connexion refusée tant que `PENDING_APPROVAL` (403), approbation, connexion réussie, connexion Socket.io authentifiée fonctionnelle, et connexion Socket.io sans session correctement rejetée.

---

## Patch 24 — Hostile Takeover & M&A Defense, Interface Outlook & Teams (2026-07-30)

### Ajouts
- **⚔️ Hostile Takeover & M&A Defense** : une banque prédatrice peut périodiquement lancer une OPA hostile sur un deal actif du pipeline M&A — 90 secondes pour déployer une défense sur la page M&A, sous peine de perdre le client (le deal disparaît du pipeline, un rival encaisse l'opération, la santé de la banque en pâtit). Deux défenses : Poison Pill (réussit à tout moment, dilue la valorisation du deal de 5%) et Chevalier Blanc (ne coûte rien, mais indisponible dans les 30 dernières secondes).
- **🖥️ Interface Outlook & Teams** : le Mail adopte une mise en page à 3 volets façon Outlook (dossiers, liste de messages, volet de lecture). L'Agenda affiche un vrai calendrier mensuel façon Outlook, navigable mois par mois. Le Terminal Chat se présente en rail de canaux façon Teams (News, Deals, et un fil dédié par collègue pour les messages privés) plutôt qu'en panneaux empilés.
- Règlement enrichi avec l'intégralité des mécaniques ci-dessus.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/hostileTakeover.js` (nouveau) : réutilise directement `gameState.maDeals` (le pipeline M&A existant) comme réservoir de cibles plutôt que d'inventer une notion parallèle d'entreprise cible — le deal menacé EST le client à sauver.
- La refonte Outlook/Teams est intégralement côté présentation : aucune donnée ni handler serveur n'a changé (même `mail:send`, `agenda:create`, `terminal:sendDM`, `teamChat:post`) — vérifié explicitement en régression pour confirmer qu'aucun câblage n'a été cassé par le remaniement visuel.
- L'état d'affichage (dossier Mail sélectionné, mois de l'Agenda affiché, canal Terminal actif) est un état d'interface transitoire (variables de module côté client), pas un état de partie — il n'est ni partagé entre joueurs ni persisté.
- Régression complète menée en direct via `socket.io-client` : apparition d'une OPA hostile, défense Poison Pill réussie avec dilution réelle de la valorisation, perte effective d'un client faute de défense à temps, rejet du Chevalier Blanc sous 30 secondes, et vérification que les 4 handlers Mail/Agenda/Terminal fonctionnent toujours après la refonte visuelle.

---

## Patch 23 — Private Banking & Wealth Management, Algorithmic & HFT Trading (2026-07-30)

### Ajouts
- **💎 Private Banking & Wealth Management** : nouveau département (cluster Gestion de Fortune) et nouvelle page dédiée. Des Family Offices ultra-fortunés (200 à 800 M$ de fortune nette) sollicitent périodiquement un mandat de gestion (Discrétionnaire ou Conseil), à signer sous 4 minutes. Signer un mandat crédite directement le dépôt à la liquidité (capital alloué) d'une entité régionale qui exploite réellement un desk Private Banking (Francfort ou Hong Kong, Global Footprint), en plus d'une commission immédiate sur le résultat net.
- **🤖 Algorithmic & HFT Trading** : sur la page Marchés, un Trader configure et lance un bot de trading automatique (instrument, stratégie Momentum ou Retour à la moyenne, taille par trade) qui exécute ensuite ses décisions en autonomie, activable/désactivable à tout moment. La DRH, la Sécurité Informatique ou le Board Of Directors peuvent investir dans l'infrastructure de latence de la banque (Colocation, Fibre dédiée, Micro-ondes propriétaire) — chaque palier accélère réellement la cadence d'exécution de tous les bots actifs.
- Règlement enrichi avec l'intégralité des mécaniques ci-dessus.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/seedData.js`/`server/departmentAccess.js` : nouveau département "Private Banking & Wealth Management" mappé au cluster C (Gestion de Fortune), avec sa propre page "privateBanking" — accès universel côté navigation, mutation des mandats gérée par les mêmes rôles que le reste du cluster.
- `server/privateBanking.js` (nouveau) : le lien "dépôts → liquidité d'entité" réutilise directement `activeDesks.includes("PRIVATE_BANKING")` (déjà présent sur Francfort et Hong Kong depuis le Global Footprint du Patch 19) plutôt que d'inventer un nouveau rattachement — un vrai lien causal entre patches, pas une coïncidence de nommage.
- `server/algoTrading.js` (nouveau) : `decideBotAction()` est une fonction pure (instrument + stratégie → "long"/"short"/rien) testée unitairement indépendamment de toute boucle ou socket, même discipline que `computeVaR()` (Patch 18) et les décisions de `centralBank.js` (Patch 22).
- Le geste "investir dans la latence" retire un vrai coût du résultat net (`financeKPIs.netIncome`) et est rejeté avec un motif explicite si les fonds sont insuffisants — testé en direct avec l'état de départ réel du jeu (108 M$ de résultat net, sous le coût de 150 M$ du premier palier), pas un état artificiellement gonflé.
- Régression complète menée en direct via `socket.io-client` : accès à la nouvelle page pour le nouveau département, apparition d'un Family Office, signature de mandat créditant réellement une entité Private Banking, expiration d'un mandat non signé, création/pause/reprise d'un bot, et double vérification du contrôle d'accès à l'investissement latence (rejet pour fonds insuffisants côté Board Of Directors, rejet silencieux côté rôle non autorisé).

---

## Patch 22 — Central Bank & Monetary Policy, Regulatory Stress Testing (2026-07-29)

### Ajouts
- **🏛 Central Bank & Monetary Policy** : une IA Fed et une IA BCE annoncent périodiquement (toutes les 3 à 5 minutes) une décision de taux directeur et une lecture d'inflation. Deux nouveaux instruments réellement négociables — **US 10Y** et **Euribor 3M** — bougent directement avec ces décisions ; le Desk Trading et désormais la **Trésorerie de Groupe** (accès Marchés élargi) peuvent ouvrir des positions dessus pour en tirer parti. Chaque décision crée aussi une onde de choc sur le reste du marché (obligations, actions, cryptoactifs), proportionnelle à son ampleur.
- **📐 Regulatory Stress Testing & Basel Ratios** : un régulateur IA contrôle toutes les 90 à 150 secondes le ratio Tier 1 de chacune des 4 entités régionales (Global Footprint, Patch 19) face au minimum Basel (10,5%). Une entité non conforme subit une pénalité de fonds propres réelle (5% de son capital alloué) et déclenche une restriction de distribution de bonus pour toute la banque (CIB Bonus Pool et primes RH) pendant plusieurs minutes.
- Règlement enrichi avec l'intégralité des mécaniques ci-dessus.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/gameState.js` : 2 nouveaux instruments de marché ("US 10Y", "Euribor 3M", catégorie "Taux", prix exprimé en points de base) ajoutés à `MARKET_INSTRUMENTS_SEED` — tradables via `markets:buy` exactement comme n'importe quel autre instrument, sans changement de mécanique.
- `server/departmentAccess.js` : le cluster E (Trésorerie de Groupe) gagne l'accès à la page Marchés — demande explicite du brief ("desks Trading ET Trésorerie").
- `server/centralBank.js` (nouveau) et `server/regulatoryStressTest.js` (nouveau) : suivent la même convention de boucle auto-reprogrammée que le reste du jeu ; leurs fonctions de décision/contrôle sont volontairement pures (ne touchent que `gameState`, jamais `io` directement) pour rester unitairement testables, comme `computeVaR()` (Patch 18).
- La restriction de distribution de bonus d'un Stress Test raté n'est pas cosmétique : `isBonusDistributionRestricted()` est appelée directement dans les handlers déjà testés `cib:distributeBonus` (`server/cibBonus.js`) et `hr:distributeBonus`/`hr:autoDistributeBonus` (`server/handlers/hr.js`), qui rejettent la distribution avec un motif explicite tant que la restriction est active.
- Régression complète menée en direct via `socket.io-client` : accès Marchés de la Trésorerie, snapshot avec les 2 nouveaux instruments + états `centralBank`/`stressTest`, décision de politique monétaire déplaçant réellement US 10Y, déclenchement d'un Stress Test raté (ratio Tier 1 abaissé via la page Global Footprint) avec pénalité de capital + restriction de bonus, et rejet effectif d'une tentative de distribution de bonus pendant la restriction.

---

## Patch 21 — Banques Concurrentes Agressives (2026-07-29)

### Ajouts
- **🔻 Vente à découvert (Short)** : le Desk Marchés peut désormais ouvrir des positions courtes en plus des positions longues (sélecteur Long/Short à l'ouverture) — une position courte gagne quand le cours baisse, perd quand il monte.
- **🏦 Guerre des Mandats (confirmée + élargie)** : les banques rivales soumettaient déjà une offre dès l'ouverture d'un mandat Pitchbook (plus rapide que les 30-60s demandés) — élargi pour couvrir aussi les émissions obligataires, pas seulement les mandats M&A.
- **🎯 Chasse aux têtes (Poaching)** : si la satisfaction moyenne des équipes connectées de Blackwell & Co chute trop bas, une banque rivale tente de débaucher un employé humain ou un collègue IA. La RH a 60 secondes pour contre-offrir une revalorisation salariale (nouveau panneau sur la page RH) ; sans réaction, un joueur humain garde son poste (mais sa satisfaction chute), tandis qu'un collègue IA est remplacé par un(e) nouvel(le) arrivant(e).
- **🔥 Short Squeeze** : si une position courte visible dépasse 150 M$, une banque rivale peut tenter de faire sauter les stops — le cours de l'instrument bondit brutalement (+8 à +15%) et la position est liquidée d'office à perte réelle.
- Règlement enrichi avec l'intégralité des mécaniques ci-dessus.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/rivalAggression.js` (nouveau) : 3 boucles indépendantes auto-reprogrammées (spawn de tentatives de débauchage, balayage d'expiration, tentatives de short squeeze), même convention que le reste du jeu.
- Un joueur humain n'est **jamais retiré de la partie** par le poaching — seule sa satisfaction est affectée en cas d'échec de rétention, contrairement à un collègue IA qui peut être effectivement remplacé (aucun risque de casser l'expérience d'un vrai joueur).
- La vente à découvert réutilise directement la formule de P&L existante (`notional * (prix/entrée - 1)`), simplement inversée pour les positions courtes (`-priceMove` au lieu de `priceMove`) — aucune nouvelle mécanique de calcul, juste un signe.
- Régression complète menée en direct via `socket.io-client` : déclenchement du poaching, rétention réussie via `hr:retainPoachingTarget`, expiration sans réaction (satisfaction pénalisée pour un humain, agent IA remplacé), ouverture d'une position courte et Short Squeeze de bout en bout (liquidation forcée + saut de cours observé).

---

## Patch 20 — Heartbeat Loop, Personnalités & Chat IA (2026-07-29)

### Ajouts
- **🤖 Collègues IA nommés avec personnalité** : 3 agents IA travaillent désormais en parallèle des joueurs humains, chacun avec son propre rythme indépendant (5-15s) — Marcus Chen (Trader IA, 🤠 The Cowboy — agressif, rapide, parfois hors fourchette de prix), Julien Beaumont (Analyste M&A IA, 🤝 The Dealmaker — origination charismatique), Elena Kowalski (Risk Manager IA, 🏛 The Institutional — prudente). Visibles avec leur profil complet sur l'Organigramme (page RH).
- **💓 Heartbeat Loop** : à chaque cycle, chaque agent agit selon son rôle — le Trader répond aux RFQ ou couvre une exposition delta non hedgée ou prend une petite position ambiante ; l'Analyste M&A soumet une offre de Pitchbook ou fait avancer un deal en cours ; le Risk Manager revoit la VaR de la banque, relance un Risk Manager humain qui tarde à trancher un dossier (au-delà de 15s), et tranche lui-même au-delà de 30s si personne n'a agi. Chaque action génère une entrée dans le fil d'activité.
- **💬 Chat interne bidirectionnel** : le Chat d'équipe (Vue d'ensemble et Terminal Chat) accepte désormais les messages des joueurs, pas seulement les messages système/IA. Mentionner un agent (@trading, @ma, @risk, ou son prénom) déclenche une réponse rapide et réaliste sous 2 à 6 secondes.
- **📢 Messages contextuels des IA** : succès (RFQ remporté, mandat M&A sécurisé avec le vrai P&L de la clôture), urgence (alerte VaR nommant le joueur et l'instrument concernés, délai de 30s avant liquidation), relance amicale (un dossier M&A qui traîne depuis 15s se voit rappelé par son nom).
- Règlement enrichi avec l'intégralité des mécaniques ci-dessus.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/aiAgents.js` (nouveau) : chaque agent a sa propre boucle auto-reprogrammée indépendante (pas un timer partagé), le délai de base étant modulé par le facteur de vitesse de sa personnalité.
- Contrairement à `server/ai.js` (IA ambiante existante, qui n'agit que lorsqu'une page est totalement inoccupée), ces 3 agents agissent en continu, en parallèle des humains — un choix délibéré pour répondre au retour "les IA sont trop passives".
- Le nudge/tranchage du Risk Manager IA (15s/30s) ne rentre jamais en conflit avec le fallback existant `aiReviewPendingRisk` de `server/handlers/dealWorkflow.js` (qui résout en ~2s mais seulement si personne n'est connecté à Conformité) : les deux systèmes se partagent naturellement selon la présence humaine, sans coordination explicite nécessaire.
- Réutilise au maximum les fonctions déjà extraites d'autres patches plutôt que de redériver la logique : `respondToRfq()` (nouvellement extrait de `server/rfq.js`, même convention que `advanceRandomDeal`), `advanceRandomDeal()` (`server/handlers/ma.js`), `progressRandomComplianceItem()` (`server/handlers/compliance.js`), `computeVaR()`/`varStatus()` (`server/riskControl.js`).
- Le message de succès M&A calcule le P&L réel de la clôture (delta du P&L de la league table avant/après l'action) plutôt que d'inventer un chiffre — aucune donnée fictive n'est affichée comme si elle provenait du jeu.
- Régression complète menée en direct via `socket.io-client` : présence des 3 agents au snapshot, activité visible du Heartbeat Loop, envoi de message joueur, réponse à une mention par tag de rôle et par prénom, cycle complet nudge (15s) puis tranchage (30s) du Risk Manager IA.

---

## Patch 19 — Design System Terminal Institutionnel & Global Footprint multi-entités (2026-07-29)

### Ajouts
- **🎨 Refonte visuelle complète — Terminal Financier institutionnel** :
  - Nouvelle palette sombre profonde (#0B0E14 / #121824), accents bleu glacier (#3B82F6) et or institutionnel (#D97706), remplaçant l'ancien accent vert néon "gaming".
  - Police monospace technique (JetBrains Mono) appliquée à tous les chiffres et P&L pour un alignement parfait.
  - Densité d'information augmentée : padding réduit sur les panneaux, tableaux, cartes KPI et la barre latérale.
  - **Micro-interactions** : flash vert/rouge bref sur les chiffres qui viennent de changer (cours, P&L, capital) plutôt qu'une mise à jour silencieuse.
  - **Global Ticker Tape** : bandeau défilant en haut de toutes les pages, affichant 4 indices dérivés du marché simulé (S&P 500, EUR/USD, Taux US 10Y, Brent) et l'heure locale de New York, Londres, Tokyo et Hong Kong.
  - Raccourcis clavier étendus à F5 (Vue d'ensemble) et F6 (Global Footprint), en plus de F1-F4 existants.
  - Le panneau Workspace modulable (Patch 17) peut désormais aussi être **redimensionné** par paliers (⤒/⤓), en plus d'être réorganisé et masqué.
- **🌍 Global Entities & Footprint** : Blackwell & Co Capital devient un groupe multi-entités façon grande banque internationale, avec 4 entités juridiques régionales (New York — Amériques, Francfort — Europe, Londres — Europe/Offshore, Hong Kong — Asie-Pacifique) totalisant plus de 300 000 collaborateurs. Chaque entité a ses effectifs locaux, son régulateur, son capital alloué, son ratio CET1, son P&L régional, son coût de masse salariale et ses desks actifs — tous modifiables par le Head of CIB, la DRH Global ou le Board Of Directors. Une carte du monde stylisée affiche les hubs, leur activité et leur statut d'ouverture de marché en temps réel (calculé sur les vrais fuseaux horaires). Les managers autorisés peuvent transférer du capital entre entités (liquidité overnight) ; si l'entité européenne manque de fonds propres pour un gros deal M&A en cours d'exécution, New York injecte automatiquement le capital manquant.
- Règlement enrichi avec l'intégralité des mécaniques ci-dessus.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- **Adaptation honnête (comme le précédent de server/negotiation.js au Patch 18)** : la demande initiale spécifiait un fichier de types TypeScript (`/src/types/globalBank.ts`) connecté à un "store" côté client. Ce projet n'a ni pipeline TypeScript, ni arborescence `/src/`, ni abstraction de store — tout le jeu repose déjà sur un unique `gameState` faisant autorité côté serveur, diffusé par Socket.io et reflété dans un `appState` côté client (c'est le "store global" de ce jeu). La forme demandée est reproduite dans `server/globalBank.js` en JS + JSDoc (champs structurellement identiques, réellement lus/mutés/diffusés par le serveur qui tourne) plutôt qu'en `.ts` qu'aucune étape de build ne compilerait jamais.
- `server/globalBank.js` (nouveau) : suit la même convention spawn/sweep en boucle auto-reprogrammée que le reste du jeu ; `isDrhGlobal()` mirrore exactement la forme de `isHeadOfCIB()` (cluster + grade Director+) pour l'autre rôle explicitement nommé dans la demande.
- L'injection automatique de capital est une boucle d'observation indépendante (`sweepCapitalInjections`), pas un hook direct dans `server/handlers/dealWorkflow.js` déjà testé — même logique de séparation que la Margin Call du Risk Manager (Patch 18) vis-à-vis du reste du Trading.
- Le Global Ticker Tape ne fait appel à aucune donnée de marché externe réelle : les 4 indices affichés sont dérivés des instruments déjà simulés par le jeu (`server/handlers/markets.js`), diffusés à tous les joueurs via un événement public allégé (`globalTicker:update`, id/nom/prix/catégorie uniquement) distinct du `markets:update` complet réservé aux accès Marchés/Conformité.
- `player.isDrhGlobal` est précalculé côté serveur à la connexion et recalculé sur promotion/réaffectation RH — même traitement que `player.isHeadOfCIB` déjà existant.
- Redimensionnement du Workspace modulable adapté en contrôle par paliers (+/- 60px) plutôt qu'en drag-resize libre par poignée : un vrai système de grille redimensionnable à la main sans framework aurait démesurément élargi le risque de ce patch pour un gain d'ergonomie marginal — même esprit d'adaptation honnête que le choix "haut/bas" déjà fait pour le réordonnancement au Patch 17.
- Régression complète menée en direct via `socket.io-client` sur les nouveaux flux (snapshot globalBank/publicTicker, diffusion du ticker, contrôle d'accès des mutations Global Footprint, transfert de capital autorisé/refusé, mise à jour d'entité, injection automatique de capital de bout en bout).

---

## Patch 18 — Refonte Trading & M&A, Risk Manager passionnant, Terminal Financier & Fin de partie (2026-07-28)

### Ajouts
- **📨 Refonte du Trading — Risque réel**, en 3 volets :
  - **RFQ (Request for Quote)** : des clients institutionnels IA envoient en direct des demandes de prix sur un gros volume. Le Desk Marchés a 15 secondes pour proposer un cours d'achat/vente — un écart de plus de 3% par rapport au cours de référence fait échouer la demande ; une cotation acceptée rapporte un profit immédiat.
  - **Delta Hedging & couverture** : créer un produit structuré (swap, collar, option…) laisse une exposition delta non couverte, qui alimente directement la VaR de la banque tant qu'elle n'est pas hedgée sur le marché spot sous 90 secondes.
  - **Effet de levier, Margin Call & liquidation forcée** : quand la VaR totale du book dépasse la moitié de la trésorerie disponible, un Margin Call se déclenche — le Risk Manager a 30 secondes pour injecter le cash requis, sinon la position la plus risquée est liquidée d'office à perte réelle (jusqu'à -15% de son notionnel) avec pénalité de santé.
- **🤝 Refonte du M&A / Corporate Finance**, en 3 volets :
  - **Data Room Interactive** : chaque deal M&A/LBO génère désormais une Data Room (bilan financier, EBITDA, dette nette) que l'Analyste peut analyser pour révéler une juste valeur estimée et un verdict (cible sur/sous-évaluée) avant de s'engager.
  - **Négociation M&A** : un canal de négociation de 3 minutes s'ouvre sur un deal en cours pour s'accorder sur le prix par action et une clause de garantie d'actif/passif — adapté honnêtement contre une contrepartie IA (le jeu n'a qu'une seule banque réellement jouable, une négociation littérale acheteur-joueur / vendeur-joueur n'était pas possible sans une refonte multi-tenant beaucoup plus large).
  - **M&A Breakthrough** : quand un deal suffisamment important (≥ 300 M$) est signé et exécuté, une annonce de marché globale s'affiche pour tous les joueurs, avec une hausse immédiate du cours d'une action liée au secteur du deal.
- **🛡 Risk Manager & Compliance rendu passionnant**, en 3 volets :
  - **Panneau de Contrôle VaR** : matrice en temps réel de la Value at Risk portée par chaque Trader/Analyste (positions marchés + expositions structurées non couvertes), avec seuils d'alerte visuels.
  - **Kill Switch** : le Risk Manager peut interdire à un Trader de passer un ordre pendant 2 minutes, ou geler un deal M&A dont le risque de défaut dépasse un seuil critique.
  - **Audits SEC/BCE impromptus** : toutes les 3 à 6 minutes, une IA régulatrice contrôle la banque — trop d'alertes en retard ou de positions non couvertes depuis plus de 5 minutes déclenche une amende record prélevée immédiatement sur la trésorerie.
- **⌨️ Terminal Financier & ambiance**, en 3 volets :
  - **UI style terminal pro** avec raccourcis clavier F1 (Terminal Chat), F2 (Marchés), F3 (RH), F4 (M&A) — désactivés pendant la saisie dans un champ de texte.
  - **Sound Design** : ambiance de salle de marché en fond sur la page Marchés, clochette de bourse sur un gros deal clos, bip d'urgence sur une alerte Risk, bruit de tampon sur une embauche RH — réglable dans les Paramètres.
  - **Notifications Flash** : pop-up discrète en haut à droite dès qu'un collègue ou une IA réalise une action d'impact dans la banque.
- **🕐 Fin de partie & classement général**, en 3 volets :
  - **Journées de Bourse** : une session complète dure désormais 4 Journées de Bourse de 15 minutes réelles (1h de jeu total).
  - **Cérémonie des Trophées** : à la clôture de la 4ᵉ journée, la partie se fige et une cérémonie récompense Banque de l'Année (P&L le plus élevé), Dealmaker of the Year (plus gros volume M&A géré), Star Trader (meilleur P&L de trading) et Meilleur Employeur (RH avec le plus d'actions positives).
  - **Sauvegarde & Historique** : le Hall of Fame et le résultat de chaque Cérémonie des Trophées sont désormais enregistrés dans un fichier d'historique persistant, qui survit à une réinitialisation manuelle et à un redémarrage du serveur.
- Règlement enrichi avec l'intégralité des mécaniques ci-dessus.

### Retraits
- Aucun.

### Correctifs
- `gameState.marketDay.deadline` n'était jamais re-primé après un `game:requestReset` (contrairement à `quarterDeadline`, qui l'était déjà) — la journée de marché, et donc la nouvelle structure de fin de partie en 4 jours, ne pouvait jamais avancer sur une partie relancée manuellement.

### Notes techniques
- `server/riskControl.js`, `server/rfq.js`, `server/negotiation.js`, `server/dataRoom.js` (nouveaux) : suivent la même convention spawn/sweep en boucles auto-reprogrammées indépendantes que le reste du jeu.
- `computeVaR()` (`server/riskControl.js`) additionne le risque des positions marchés réelles ET l'exposition delta non couverte des produits structurés (`unhedgedDeltaTotal()` de `server/structuredProducts.js`) — un lien causal direct entre Delta Hedging et Margin Call, pas deux systèmes isolés.
- `server/trophies.js` (nouveau) : les 4 trophées sont calculés à partir de données déjà suivies par le jeu (league table, workflows exécutés, journal de trading, compteurs d'actions RH) plutôt que d'ajouter un nouveau système de suivi dédié ; `endSession()` gèle la partie via le flag `paused` déjà respecté par toutes les boucles existantes.
- `server/persistence.js` (nouveau) : pas de base de données managée configurée sur ce déploiement — implémenté en fichier JSON local (`data/history.json`), qui survit aux resets et redémarrages du serveur mais pas à un redéploiement Render (nouveau disque).
- `server/gameState.js` : `seedDataRoom()` dupliqué en miniature depuis `server/dataRoom.js` pour éviter un cycle de dépendances (`dataRoom.js` importe déjà `gameState.js` pour `pushActivity`).
- Régression complète menée en direct via `socket.io-client` sur les nouveaux flux (RFQ, Delta Hedging, Margin Call, Kill Switch, Audit impromptu, Data Room, Négociation, M&A Breakthrough) et sur le cycle complet des 4 Journées de Bourse jusqu'à la Cérémonie des Trophées.

---

## Patch 17 — Refonte RH complète, Pitchbook, Produits Structurés, Illiquidité interbancaire & Workspace modulable (2026-07-28)

### Ajouts
- **👥 Refonte RH complète**, en 6 volets :
  - **Organigramme & RH Core** : promotions (grade supérieur, salaire de base recalculé selon un barème par grade, satisfaction en hausse) et réaffectation d'un collaborateur à un autre desk (M&A, Trading, Gestion de Fortune, Risk, Finance, RH) — l'accès aux pages et les rooms Socket.io se resynchronisent instantanément.
  - **Mercato & Recrutement** : chaque talent rival a désormais une loyauté ; sous 40%, une offre est provisoirement acceptée et ouvre une fenêtre de 60 secondes pendant laquelle la banque d'origine peut contre-offrir pour le retenir.
  - **Compensation & Bonus Pool** : répartition automatique du bonus pool au prorata du score (en plus de la répartition manuelle existante), et masse salariale mensuelle (salaires de base des joueurs connectés) désormais prélevée sur le résultat net à chaque clôture de journée de marché.
  - **Performance & Formation** : chaque deal exécuté augmente le stress des 3 rôles impliqués ; un collaborateur peut être envoyé en sabbatique/formation pour faire retomber son stress et progresser en compétence.
  - **Climat Social & Démissions** : stress ≥ 85% déclenche un burn-out (arrêt de travail forcé) ; satisfaction < 30% déclenche une demande d'augmentation (accordable par la RH) ; satisfaction critique garde un vrai risque de démission sèche (mécanique déjà existante, désormais reliée à ce climat social élargi).
  - **Discipline & Compliance** : une alerte de conformité ciblant nommément un collaborateur (ex. délit d'initié) permet à la RH de le suspendre temporairement, lui donner un blâme, ou le licencier pour faute grave.
- **🏛 Board of Directors & Activist Shareholders** : le Conseil d'Administration IA évalue la performance du Head of CIB à chaque clôture de journée de marché ; après plusieurs périodes consécutives de résultat non positif, il vote son renvoi et nomme aussitôt un(e) autre collaborateur/trice éligible si possible.
- **📋 Pitchbook Competition** : un client IA met régulièrement un mandat M&A en concurrence entre banques (3 minutes pour soumettre une offre chiffrée). Le client arbitre entre commission et crédibilité — cette dernière directement dérivée de la note de crédit (Rating Agency, Patch 16). Une victoire crée un vrai deal M&A dans le pipeline.
- **🧩 Produits Structurés & Swaps** : des clients corporate générés par l'IA ont ponctuellement besoin d'une couverture sur-mesure (taux, change, matières premières, crédit) ; le Desk Marchés leur packages un swap/collar/option — une structure bien adaptée à l'exposition rapporte nettement plus qu'un choix approximatif.
- **🚫 Refus de Prêt Interbancaire & Illiquidité** : si la santé de la banque tombe sous 35%, les banques rivales coupent leurs lignes de crédit Repo — le Desk Marchés ne peut plus ouvrir de nouvelles positions. L'accès revient naturellement au-dessus de 55% de santé, ou immédiatement via le guichet d'urgence de la Banque Centrale (Board Of Directors uniquement), à un vrai coût en résultat net et en santé.
- **🧩 Workspace modulable** : sur Vue d'ensemble, un nouveau panneau permet d'afficher, masquer et réorganiser (haut/bas) les panneaux informatifs (League Table, Chat d'équipe, Priorités, Hall of Fame…) — préférence locale au navigateur.
- Règlement enrichi avec toutes les mécaniques ci-dessus, ainsi que celles du Patch 16 (Dark Pool, IPO, Rating Agency, Bonus Pool CIB, Terminal Chat) qui n'y avaient pas encore été documentées.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/gameState.js` : nouveau `buildPublicRoster()` centralisé (satisfaction, stress, loyauté, compétence, salaire, sabbatique/arrêt/suspension) — évite un cycle de dépendances entre `server/handlers/hr.js`, `server/satisfaction.js` et `server/handlers/join.js`.
- `server/rooms.js` : le player gagne à la connexion `baseSalary`, `stress`, `loyalty`, `skillRating`, `onSabbatical`, `onSickLeave`, `raiseRequested`, `onSuspension`, `isHeadOfCIB` (précalculé plutôt que dupliqué côté client).
- `server/talentManagement.js`, `server/socialClimat.js`, `server/complianceHR.js` (nouveaux) : chacun a sa propre boucle indépendante (5-8s) — les sabbatiques/burn-out/suspensions durent 2-5 minutes, bien plus courtes que le cycle de 15 minutes de la journée de marché, donc impossible de les rattacher à `settleMarketDay()` comme la paie ou la Rating Agency.
- `server/boardOfDirectors.js` (nouveau) : distingue `player.isHeadOfCIB` (permission d'accès générique) de `gameState.cibLeadership` (l'office formel unique que le Conseil attribue et peut vacater).
- `server/pitchbook.js`, `server/structuredProducts.js`, `server/interbank.js` (nouveaux) : suivent la même convention spawn/sweep en boucles indépendantes que le reste du jeu.

---

## Patch 16 — Dark Pool, IPO, Rating Agency, Bonus Pool CIB, Terminal Chat & Board Of Directors (2026-07-28)

### Ajouts
- **🌑 Dark Pool** : le Desk Marchés peut désormais passer des ordres anonymes de gros volume (≥ 300 M$) qui n'affectent pas le prix affiché. Sous quelques secondes, une banque rivale peut anonymement en prendre l'autre côté OTC — un match donne un petit gain garanti (position évitée sur le marché ouvert), sans contrepartie ni coût en cas d'expiration.
- **📈 Système d'IPO** : les banques concourent pour le mandat d'introduction en bourse d'une entreprise cliente (soumission d'un pitch sous 45s). La banque gagnante fixe le prix puis collecte les intentions d'achat des joueurs et d'investisseurs institutionnels simulés avant la mise en cotation — une sursouscription forte fait bondir le cours, un prix mal calibré le fait chuter. Frais d'introduction encaissés dans tous les cas d'exécution réussie.
- **📐 Rating Agency** : un agent autonome calcule à chaque clôture de journée de marché le ratio de solvabilité et de liquidité de Blackwell & Co pour ajuster sa note de crédit (AAA à D) — visible dans le classement des banques. La note impacte désormais directement le coût des emprunts : elle multiplie le résultat net réellement encaissé sur chaque exécution de deal, jusqu'à +15% en AAA et -65% en D.
- **💼 Bonus Pool CIB** : une enveloppe spécifique au Dealmaking (cluster A) s'accumule automatiquement à chaque clôture de journée (6% du résultat net positif du jour). Seul un Head of CIB (Director ou grade supérieur au sein du Dealmaking) peut la répartir entre son équipe — joueurs et postes non pourvus (« Équipe IA »).
- **😊 Satisfaction & démission** : chaque joueur a désormais une satisfaction individuelle, influencée par les primes reçues, les décisions de congés et les sanctions Compliance. En cas de satisfaction critique, un joueur risque réellement de démissionner à la clôture d'une journée de marché — son poste redevient vacant, sans déconnexion brutale (retour à l'écran de connexion).
- **💻 Terminal Chat**, nouvelle page accessible à tous, style Bloomberg/Slack : canal News (le fil d'équipe existant), canal Deals (commentaires IA en continu sur les deals en cours) et messagerie privée instantanée entre joueurs.
- **🏛 Panel Board Of Directors** : un tableau de bord exécutif sur le Comité de Direction agrégeant la note de crédit, l'enveloppe CIB, l'activité Dark Pool, le statut IPO en cours et les collaborateurs à risque de démission.
- Passe d'amélioration esthétique : traitement de focus cohérent sur tous les champs de saisie du site (y compris les nouveaux panels), défilement personnalisé sur les écrans du Terminal Chat.

### Retraits
- Aucun.

### Correctifs
- **Le Comité de Direction (page Stratégie) est désormais réservé exclusivement au département Board Of Directors** (tous grades confondus) — un Managing Director ou Director d'un autre département, qui y avait accès depuis les patchs précédents, ne le voit plus du tout. Cette règle ne s'applique qu'à cette page ; les autres privilèges liés au grade (bouton « Nouvelle partie », etc.) sont inchangés.

### Notes techniques
- **Renommage** : le département « Direction Générale » est renommé « Board Of Directors » dans tout le code et l'interface (clé de `DEPARTMENT_CLUSTER`, libellés client, textes). `hasStrategyAccess(dept)` ne dépend plus du grade — uniquement du département — et `getAccessForPosition()` retire explicitement « strategy » de la liste complète accordée par grade (`hasFullAccess`) quand le département n'est pas Board Of Directors.
- `server/ratingAgency.js` (nouveau) : `computeBlackwellRating()` (solvabilité/liquidité réelles) et `computeRivalRating()` (nudge d'une note selon la tendance de P&L) sont des fonctions pures testées indépendamment ; `getBorrowingCostMultiplier()` est consommé par `server/handlers/dealWorkflow.js` sur les deux chemins d'exécution (direct et syndiqué).
- `server/satisfaction.js` (nouveau) : évite délibérément d'importer `publicRoster` de `server/handlers/join.js` (qui importe déjà `server/handlers/hr.js`, lui-même désormais consommateur de `adjustSatisfaction`) — un import circulaire a été détecté et contourné en dupliquant la sérialisation minimale du roster plutôt qu'en la partageant.
- `server/cibBonus.js` (nouveau) : `player.isHeadOfCIB` est précalculé côté serveur à la connexion (`server/rooms.js`) plutôt que dupliqué côté client.
- `server/handlers/markets.js` : le Dark Pool est distinct de `markets:buy`/`markets:sell` — aucune position n'est ouverte, le résultat (gain ou expiration) est réglé immédiatement via sa propre boucle de balayage.
- `server/ipo.js` (nouveau) : `resolveBidding()`/`resolveListing()` sont testées unitairement avec `Math.random` maîtrisé pour couvrir victoire/défaite du mandat et sursouscription/flop à la cotation.
- `server/terminal.js` (nouveau) : le canal « News » réutilise directement `gameState.teamChat` plutôt que de le dupliquer.

---

## Patch 15 — Crise Majeure, Mercato, Syndication inter-banques, Information Privilégiée & Règlement (2026-07-27)

### Ajouts
- **🆘 Crise Majeure (War Room)** : toutes les 8 à 12 minutes, un événement choc frappe toute la banque (contrôle réglementaire surprise, cyberattaque, scandale médiatique, krach généralisé). Une fenêtre d'urgence s'ouvre pour **tous les joueurs connectés**, quelle que soit la page consultée, avec un chrono de 180 secondes : chaque département doit valider une action critique. À 4 départements opérationnels sur 6 validés, la crise est maîtrisée ; en dessous, dégâts réels sur la santé de la banque et le résultat net, proportionnels au nombre de départements restés silencieux.
- **🔀 Mercato Inter-Banques** : la RH et les Directeurs (tous départements confondus) peuvent désormais consulter le vivier de talents des 5 banques rivales et leur soumettre une offre de débauchage avec un meilleur salaire — plus l'écart proposé est généreux, plus l'offre a de chances d'être acceptée. Un débauchage réussi grossit l'effectif et remonte le moral des équipes.
- **🌐 Syndication de Crédit inter-banques** : pour les deals M&A les plus massifs (≥ 500 M$), le Desk Trading peut, une fois le Risque validé, proposer de découper le deal en tranches offertes à des banques rivales, qui négocient et répondent chacune sous quelques secondes. Blackwell & Co ne retient alors que sa tranche de tête (+ les tranches déclinées) contre un fee plus petit, mais un risque partagé — les banques qui acceptent empochent leur propre profit, visible au classement des banques.
- **🕵️ Information Privilégiée & Compliance** : le Desk Marchés peut désormais négocier sur un deal M&A pas encore public, pour un gain immédiat généreux — mais chaque tentative expose à un contrôle de Compliance (environ 1 chance sur 3) qui inflige une amende, une perte de réputation et une alerte publique en cas de flagrant délit.
- **📖 Nouvelle page Règlement**, accessible à tout le monde : un tutoriel complet couvrant chaque mécanique du jeu (rôles/clusters, Comité de Direction, workflow M&A, Marchés, tous les ajouts ci-dessus, tâches rapides, événements, IA ambiante, score), plus une section Paramètres (activer/désactiver les notifications toasts, difficulté actuelle affichée, bouton pour revoir le message d'accueil).

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `server/warRoom.js` (nouveau) : suit la convention des boucles auto-reprogrammées existantes (spawn + balayage indépendants), résolution idempotente soit par soumission complète des 6 clusters opérationnels, soit par dépassement du délai de 180s.
- `server/mercato.js` (nouveau) + `gameState.rivalTalent` (10 PNJ répartis sur les 5 banques rivales déjà connues du classement) : accès partagé via les rooms Socket.io `access:hr` et `access:strategy` (donc aussi les Directeurs des autres départements, pas seulement RH).
- `server/handlers/dealWorkflow.js` : nouvelle phase de workflow `"syndicating"` distincte de la méthode d'exécution `"syndication"` déjà existante (un simple multiplicateur de fee interne, sans banque rivale) — pour éviter toute confusion, la nouvelle mécanique est nommée `syndication_interbanques` dans le code et « Syndication inter-banques » côté interface.
- `server/handlers/markets.js` : `markets:insiderTrade`, distinct de `markets:buy`/`markets:sell` — aucune position n'est ouverte, le gain ou l'amende est réglé immédiatement. Compliance est notifiée via le même `createUrgentComplianceItem()` que les contrôles réglementaires automatiques.
- `server/departmentAccess.js` : `"reglement"` ajouté à `UNIVERSAL_PAGES`.

---

## Patch 14 — Comité de Direction réservé aux Directeurs (2026-07-27)

### Correctifs
- **Le Comité de Direction (page Stratégie) n'est plus accessible à tout le monde.** Il faut désormais être Director ou grade supérieur (Executive Director, Managing Director, Partner, C-suite…) dans son département pour y accéder et verrouiller une décision trimestrielle — un Analyste ou un Associate ne le voit plus du tout dans son menu. La Direction Générale y a toujours accès quel que soit son grade, puisque ce département est déjà la direction.
- Un département sans personne d'assez senior connecté continue de se voir appliquer l'option neutre par défaut à la résolution du trimestre (comportement déjà existant, inchangé) — aucune décision ne reste bloquée.
- Corrigé au passage une vraie faille : le handler serveur `strategy:submitDecision` ne vérifiait jamais l'accès à la page — une décision aurait pu être soumise en contournant l'interface. Il vérifie maintenant explicitement l'accès, comme tous les autres handlers du jeu.

### Ajouts
- Aucun.

### Retraits
- Aucun.

### Notes techniques
- `server/departmentAccess.js` : « strategy » retiré de `UNIVERSAL_PAGES`, ajouté conditionnellement via un nouveau `hasStrategyAccess(dept, grade)` comparé à l'index de « Director » dans `GRADES`.

---

## Patch 13 — League Table & P&L Tracker (2026-07-27)

### Ajouts
- **Nouveau panneau sur Vue d'ensemble, visible par tous** : « League Table & P&L Tracker ».
- **Classement des banques** : Blackwell & Co Capital face aux 5 banques rivales déjà introduites au Patch 12 — P&L cumulé réel (pas des points gamifiés) et volume de deals clos. Les rivales ne progressent que lorsqu'elles remportent effectivement un deal laissé à l'abandon ; Blackwell progresse à chaque deal M&A clôturé, chaque exécution du workflow de deal (Patch 11) et chaque position de trading (Patch 9) débouclée.
- **Classement des meilleurs employés** : trié par prime réellement perçue, avec la réputation (palier de progression) de chacun.
- **Chronomètre de la Journée de marché** : une journée dure 15 minutes réelles. À la clôture, le résultat net du jour est arrêté et une prime (10 % du résultat positif du jour) est automatiquement répartie entre les joueurs ayant progressé pendant cette journée — annoncé dans le Chat d'équipe (Patch 12). Une journée négative ne distribue aucune prime.

### Retraits
- Aucun.

### Correctifs
- Aucun bug connu corrigé — uniquement des ajouts ce patch.

### Notes techniques
- `recordBankPnl()` (`server/gameState.js`) suit la même convention que `pushActivity`/`postTeamChat` — mutation d'état pure, les appelants diffusent eux-mêmes l'événement.
- `server/marketDay.js` (nouveau) : `settleMarketDay()` est une fonction quasi pure testable isolément (même approche que `resolveQuarter()` de `server/strategy.js`), appelée par sa propre boucle auto-reprogrammée indépendante.
- La league table est seedée avec les 2 deals déjà clôturés sous la direction précédente (Patch 8) — cohérent avec le reste du jeu, aucune partie ne démarre à zéro.

---

## Patch 12 — Des IA proactives (2026-07-27)

### Ajouts
- **IA concurrentes plus agressives** : un deal M&A laissé sans avancée plus de 2 minutes (au lieu de 3) risque désormais d'être raflé par une banque rivale nommée explicitement (Ashford & Vane, Northfield Partners, Meridian Capital Group…), avec une probabilité renforcée à chaque balayage.
- **IA Risk Manager quasi instantanée** : si aucun Risk Manager humain n'est connecté, l'IA répond désormais en quelques secondes (bien sous les 10 secondes demandées, contre 90 secondes auparavant) — avec un petit commentaire généré à partir du dossier de crédit (ex. « Dossier risqué (BB) mais accepté à 6,5 % »), visible sur la page M&A.
- **Chat d'équipe 💬** (nouveau panneau sur Vue d'ensemble) : les IA postent désormais des messages de félicitations quand un deal de plus de 300 M$ est clôturé (à la main ou via le workflow) et des messages d'alerte quand la santé de la banque repasse sous 30 %.

### Retraits
- Aucun.

### Correctifs
- Corrigé : un deal créé via le formulaire standard de la page M&A n'avait pas le champ `workflow` initialisé (`undefined` au lieu de `null`) — sans conséquence fonctionnelle jusqu'ici, mais incohérent avec tous les autres points de création de deal.

### Notes techniques
- `postTeamChat()` (`server/gameState.js`) suit exactement la même convention que `pushActivity()` — les appelants diffusent eux-mêmes l'événement après l'appel.
- L'alerte de santé utilise une hystérésis (`gameState.healthAlertSent`) : elle se déclenche une fois en dessous de 30 %, reste silencieuse tant que la santé y reste, et ne se réarme qu'après un vrai retour au-dessus de 40 % — pas de spam à chaque tick.

---

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
