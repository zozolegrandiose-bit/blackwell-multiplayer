// Règlement / tutoriel / paramètres -- a single reference page covering every
// mechanic added across all patches, plus the few genuinely client-side settings
// (toast notifications, revisiting the welcome tutorial). Static content: no
// server state needed beyond appState.difficulty for the settings section.
function reglementSectionHtml(title, bodyHtml) {
  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-title">${title}</div>
      <div style="font-size:12.5px; color:var(--text-600); line-height:1.6;">${bodyHtml}</div>
    </div>
  `;
}

function renderReglement() {
  const difficulty = appState.difficulty || "standard";
  const difficultyLabel = (typeof DIFFICULTY_LABELS !== "undefined" && DIFFICULTY_LABELS[difficulty]) || difficulty;
  const notificationsDisabled = localStorage.getItem(NOTIFICATIONS_DISABLED_KEY) === "1";

  return `
    <div class="page-title">Règlement &amp; Tutoriel</div>
    <div class="page-sub">Tout ce qu'il faut savoir pour jouer à Blackwell &amp; Co Capital — mécaniques, rôles et paramètres.</div>

    ${reglementSectionHtml("🎯 Objectif de la partie", `
      L'équipe dirige collectivement <b>Blackwell &amp; Co Capital</b>, une banque d'investissement déjà en activité. Objectif : faire grandir l'AUM (actifs sous gestion) jusqu'à l'objectif de campagne affiché sur Vue d'ensemble, avant d'épuiser le nombre de trimestres alloués.<br/>
      La <b>santé de la banque</b> (jauge sur Vue d'ensemble) reflète la qualité de la gestion collective : elle descend avec les crises non traitées, les deals ratés, les délits sanctionnés ; elle remonte avec les bonnes décisions et les deals réussis. Si elle tombe à zéro, c'est la <b>faillite</b> — partie terminée, un joueur avec accès complet peut relancer.
    `)}

    ${reglementSectionHtml("🏢 Rôles &amp; départements", `
      Chaque joueur choisit un département et un grade à la connexion, jamais réattribué automatiquement. Le département détermine un <b>cluster</b> (A à G) qui donne accès à des pages précises :
      <ul style="margin:8px 0 0 18px; padding:0;">
        <li><b>A — Dealmaking</b> (M&amp;A, ECM, DCM…) : page M&amp;A, Clients</li>
        <li><b>B — Marchés &amp; Recherche</b> : Clients, Marchés</li>
        <li><b>C — Gestion de Fortune &amp; Actifs</b> : Clients</li>
        <li><b>D — Conformité, Risque &amp; Juridique</b> : Conformité</li>
        <li><b>E — Finance &amp; Trésorerie</b> : Finance</li>
        <li><b>F — RH &amp; Communication</b> : RH</li>
        <li><b>G — Board Of Directors</b> : accès complet à toutes les pages</li>
      </ul>
      Les pages Vue d'ensemble, Mail, Agenda, Documents, Notes de frais et ce Règlement sont accessibles à tout le monde. <b>Le Comité de Direction (Stratégie) est réservé</b> : il faut être Director ou grade supérieur dans son département, ou appartenir au Board Of Directors.
    `)}

    ${reglementSectionHtml("🏛 Comité de Direction (décisions trimestrielles)", `
      La partie avance par trimestres. Chaque département opérationnel (clusters A à F) verrouille <b>une décision à compromis</b> par trimestre (ex : pipeline agressif vs défensif). Sans personne d'assez senior connecté, l'option neutre s'applique par défaut — rien ne bloque.<br/>
      Le <b>Board Of Directors</b> voit les choix déjà verrouillés des autres avant de fixer son propre multiplicateur trimestriel (Croissance, Stabilité, Réduction des coûts) — un vrai levier qui amplifie ou atténue l'effet cumulé du trimestre.
    `)}

    ${reglementSectionHtml("🤝 Workflow d'exécution des deals M&amp;A", `
      Un deal M&amp;A suit une chaîne stricte à 3 rôles : <b>Analyste M&amp;A</b> (soumet au Risque avec un taux) → <b>Risk Manager</b> (approuve/refuse, peut ajuster le taux — une IA couvre ce poste sous 10s si personne n'est connecté en Conformité) → <b>Desk Trading</b> (exécute sous 2 minutes, sinon la santé de la banque en pâtit). La prime est automatiquement répartie entre les 3 rôles.
    `)}

    ${reglementSectionHtml("🌐 Syndication de Crédit inter-banques", `
      Pour les deals les plus massifs (≥ 500 M$), le Desk Trading peut, une fois le Risque validé, proposer une <b>syndication inter-banques</b> plutôt qu'une exécution classique : des tranches du deal sont offertes à des banques rivales, qui négocient et acceptent ou déclinent chacune sous quelques secondes. Blackwell &amp; Co ne retient alors que sa tranche de tête (+ les tranches déclinées) — un fee plus petit, mais un risque partagé. Les banques qui acceptent empochent leur propre profit, visible au classement des banques.
    `)}

    ${reglementSectionHtml("📈 Marchés &amp; Information Privilégiée", `
      Le Desk Marchés trade des instruments génériques (actions, obligations, matières premières, devises, crypto) avec un capital partagé — ouvrir puis clôturer une position réalise le P&amp;L.<br/>
      <b>Information Privilégiée (risqué) :</b> les deals M&amp;A pas encore publics (statut ≠ Clôturé) sont visibles du Desk Marchés. Négocier dessus avant l'annonce rapporte un gain immédiat généreux si ça passe — mais expose à un contrôle de <b>Compliance</b> (environ 1 chance sur 3) qui inflige une amende, une perte de réputation et une alerte publique si vous êtes pris.
    `)}

    ${reglementSectionHtml("🔀 Mercato Inter-Banques", `
      La RH et les Directeurs (Director et grades supérieurs, tous départements confondus) peuvent consulter le vivier de talents des banques rivales et leur soumettre une <b>offre de débauchage</b> avec un meilleur salaire. Plus l'écart de salaire proposé est généreux, plus l'offre a de chances d'être acceptée. Un débauchage réussi grossit l'effectif et remonte le moral des équipes.
    `)}

    ${reglementSectionHtml("🆘 Crise Majeure (War Room)", `
      Toutes les 8 à 12 minutes, un événement choc frappe toute la banque (contrôle réglementaire surprise, cyberattaque, scandale médiatique, krach généralisé). Une fenêtre d'urgence s'ouvre pour <b>tous les joueurs connectés</b>, quelle que soit la page consultée, avec un chrono de 180 secondes : chaque département doit valider une action critique. Si au moins 4 des 6 départements opérationnels valident à temps, la crise est maîtrisée ; sinon, dégâts réels sur la santé de la banque et le résultat net, proportionnels au nombre de départements restés silencieux.
    `)}

    ${reglementSectionHtml("⚡ Tâches rapides &amp; événements en direct", `
      De petites tâches ⚡ apparaissent en continu sur les pages opérationnelles (15-30s, expirent sous 75s) — les traiter rapporte des points sans attendre un vrai dossier.<br/>
      Le <b>Moteur d'Événements Vivants</b> publie occasionnellement des cartes d'action (Alerte Marché, Alerte RH, Alerte Risque) que n'importe quel joueur ou IA connecté peut réclamer en un clic.<br/>
      Des <b>crises ponctuelles</b> plus classiques (contrôle réglementaire, client mécontent, krach, opportunité) surviennent aussi toutes les 4-8 minutes, résolubles par qui a l'accès à la bonne page avant l'échéance.
    `)}

    ${reglementSectionHtml("🏆 League Table &amp; Journée de marché", `
      Un classement en direct des banques (P&amp;L cumulé, deals clôturés) et des meilleurs joueurs (score, réputation) est visible sur Vue d'ensemble. La partie avance aussi par <b>journées de marché</b> (15 minutes réelles) : à la fin de chaque journée, le P&amp;L est arrêté et les bonus sont versés selon la performance de la journée.
    `)}

    ${reglementSectionHtml("🤖 IA ambiante", `
      Si personne n'est connecté sur une page pendant un moment, une IA y effectue occasionnellement une petite action réaliste (jamais un vrai deal signé en votre nom, jamais un dossier attribué) — la banque continue de tourner un minimum même quand une équipe est incomplète. Des IA concurrentes réagissent aussi si un joueur humain met plus de 2 minutes à traiter une étape, et postent des messages de félicitations ou d'alerte dans le fil d'équipe quand un gros deal se clôture.
    `)}

    ${reglementSectionHtml("⭐ Score, badges &amp; classement", `
      Chaque action significative (pas chaque clic) rapporte des points, avec un multiplicateur de +50% si votre département est sous une <b>directive prioritaire</b> du Board Of Directors. Des badges (🏅 Clôtureur, 🛡️ Bouclier, 🎯 Recruteur…) se débloquent automatiquement selon vos actions. Le Hall of Fame conserve les meilleurs scores même après une réinitialisation de partie.
    `)}

    ${reglementSectionHtml("🌑 Dark Pool", `
      Le Desk Marchés peut passer des ordres anonymes de gros volume (≥ 300 M$) sans impact sur le prix affiché. Une banque rivale peut anonymement en prendre l'autre côté OTC en quelques secondes — un match garantit un petit gain, sans coût en cas d'expiration.
    `)}

    ${reglementSectionHtml("📈 Introduction en Bourse (IPO)", `
      Les banques concourent pour le mandat d'introduction en bourse d'une entreprise cliente. La banque gagnante fixe le prix d'introduction puis collecte les intentions d'achat des joueurs et d'investisseurs institutionnels simulés avant la mise en cotation — une forte sursouscription fait bondir le cours à l'ouverture, un prix mal calibré le fait chuter.
    `)}

    ${reglementSectionHtml("📐 Rating Agency", `
      Un agent autonome calcule à chaque clôture de journée de marché la solvabilité et la liquidité réelles de Blackwell &amp; Co pour ajuster sa note de crédit (AAA à D), visible dans le classement des banques. Cette note impacte directement le résultat net réellement encaissé sur chaque exécution de deal — jusqu'à +15% en AAA, jusqu'à -65% en D : un vrai coût du capital, pas un simple affichage.
    `)}

    ${reglementSectionHtml("💼 Bonus Pool CIB & 🏛 Head of CIB", `
      Une enveloppe spécifique au Dealmaking (cluster A) s'accumule automatiquement à chaque clôture de journée (6% du résultat net positif du jour). Seul un <b>Head of CIB</b> (Director ou grade supérieur au sein du Dealmaking) peut la répartir entre son équipe. Le Conseil d'Administration évalue sa performance à chaque clôture de journée : après plusieurs périodes consécutives de résultat non positif, il peut voter son renvoi et propose aussitôt le poste à un(e) autre collaborateur/trice éligible.
    `)}

    ${reglementSectionHtml("💻 Terminal Chat", `
      Nouvelle page style Bloomberg/Slack : canal <b>News</b> (le fil d'équipe), canal <b>Deals</b> (commentaires IA en continu sur les opérations en cours) et une messagerie privée instantanée entre joueurs.
    `)}

    ${reglementSectionHtml("👥 RH — Organigramme, promotions & réaffectation", `
      La RH peut désormais <b>promouvoir</b> un collaborateur (grade supérieur, salaire de base recalculé, satisfaction en hausse) et le <b>réaffecter</b> à un autre desk (M&amp;A, Trading, Gestion de Fortune, Risk/Conformité, Finance, RH) — l'accès aux pages se met à jour instantanément.
    `)}

    ${reglementSectionHtml("🔀 Mercato — loyauté & contre-offre", `
      Chaque talent rival a désormais une <b>loyauté</b>. Sous 40%, une offre de débauchage est provisoirement acceptée mais ouvre une fenêtre de 60 secondes pendant laquelle sa banque d'origine peut contre-attaquer avec une revalorisation salariale pour le retenir.
    `)}

    ${reglementSectionHtml("💰 Compensation — bonus automatique & masse salariale", `
      En plus de la répartition manuelle, la RH peut lancer une <b>répartition automatique</b> du bonus pool au prorata du score de chacun. Une <b>masse salariale mensuelle</b> (somme des salaires de base des joueurs connectés) est désormais prélevée sur le résultat net à chaque clôture de journée de marché.
    `)}

    ${reglementSectionHtml("😓 Stress, sabbatique & climat social", `
      Chaque deal exécuté augmente le <b>stress</b> des trois rôles impliqués. Passé 85%, un <b>burn-out</b> force un arrêt de travail temporaire. Une satisfaction trop basse déclenche une <b>demande d'augmentation</b> (que la RH peut accorder) et, si rien ne change, expose à une réelle <b>démission</b>. La RH peut aussi envoyer un collaborateur en <b>sabbatique/formation</b> pour faire retomber son stress et faire progresser sa compétence.
    `)}

    ${reglementSectionHtml("⚖️ Discipline & Compliance RH", `
      Quand une alerte de conformité cible nommément un collaborateur (ex. délit d'initié), la RH peut le <b>suspendre</b> temporairement, lui donner un <b>blâme</b>, ou le <b>licencier</b> pour faute grave — le poste redevient alors vacant.
    `)}

    ${reglementSectionHtml("📋 Pitchbook Competition", `
      Un client IA met régulièrement un mandat M&amp;A en concurrence : chaque banque propose un taux de commission sous 3 minutes. Le client arbitre entre commission et crédibilité (directement liée à la note de crédit de la banque) — remporter le mandat crée un vrai deal M&amp;A dans le pipeline.
    `)}

    ${reglementSectionHtml("🧩 Produits Structurés & Swaps", `
      Des clients corporate générés par l'IA ont ponctuellement besoin d'une couverture (taux, change, matières premières, crédit). Le Desk Marchés leur package une structure sur-mesure (swap, collar, option…) — une structure bien adaptée à l'exposition rapporte nettement plus qu'un choix approximatif.
    `)}

    ${reglementSectionHtml("🚫 Illiquidité & guichet d'urgence", `
      Si la santé de la banque tombe trop bas, les banques rivales coupent leurs lignes de crédit Repo : le Desk Marchés ne peut plus ouvrir de nouvelles positions. L'accès revient soit naturellement (santé redressée), soit immédiatement via le <b>guichet d'urgence de la Banque Centrale</b> — à un vrai coût (résultat net et santé entamés).
    `)}

    ${reglementSectionHtml("🧩 Workspace modulable", `
      Sur Vue d'ensemble, un panneau « Workspace modulable » permet d'afficher, masquer, réorganiser (↑/↓) et redimensionner (⤒/⤓) les panneaux informatifs (League Table, Chat d'équipe, Priorités…) selon vos préférences — réglage local à votre navigateur.
    `)}

    ${reglementSectionHtml("📨 RFQ — Demandes de prix institutionnelles", `
      Un client institutionnel IA envoie en direct une demande de prix (RFQ) sur un gros volume d'un instrument coté. Le Desk Marchés a <b>15 secondes</b> pour proposer un cours d'achat/vente — un écart trop large par rapport au cours de référence (plus de 3%) fait échouer la demande. Une cotation acceptée rapporte un profit immédiat.
    `)}

    ${reglementSectionHtml("🛡 Delta Hedging & couverture", `
      Créer un produit structuré (swap, collar, option…) laisse une <b>exposition delta</b> non couverte sur le marché spot. Le Desk Marchés dispose d'une fenêtre de 90 secondes pour la couvrir via un ordre de couverture — au-delà, l'exposition reste ouverte et continue de gonfler la VaR de la banque tant qu'elle n'est pas hedgée.
    `)}

    ${reglementSectionHtml("📉 Effet de levier, Margin Call & liquidation forcée", `
      Quand la VaR totale de la banque (risque des positions ouvertes + expositions non couvertes) dépasse la moitié de la trésorerie, un <b>Margin Call</b> se déclenche. Le Risk Manager a <b>30 secondes</b> pour injecter le cash nécessaire depuis le résultat net. Sans intervention à temps, la position la plus risquée de la banque est <b>liquidée d'office</b> à perte (jusqu'à -15% de son notionnel) et la santé de la banque en pâtit.
    `)}

    ${reglementSectionHtml("📊 Panneau de Contrôle VaR", `
      Sur la page Conformité, une matrice affiche en temps réel la Value at Risk portée par chaque Trader et Analyste (positions marchés + expositions structurées non couvertes), avec des seuils d'alerte visuels — l'outil de diagnostic principal du Risk Manager avant qu'un Margin Call ne survienne.
    `)}

    ${reglementSectionHtml("🔴 Kill Switch", `
      Le Risk Manager peut, depuis la page Conformité, <b>interdire à un Trader de passer un ordre</b> pendant 2 minutes, ou <b>geler un deal M&amp;A</b> en cours si son risque de défaut dépasse un seuil critique — bloquant toute action dessus jusqu'à la levée automatique du gel.
    `)}

    ${reglementSectionHtml("🕵️ Audits SEC / BCE impromptus", `
      Toutes les 3 à 6 minutes, une IA régulatrice contrôle la banque : trop d'alertes de conformité en retard ou de positions non couvertes depuis plus de 5 minutes déclenche une <b>amende record</b> prélevée immédiatement sur la trésorerie, plus une pénalité de santé.
    `)}

    ${reglementSectionHtml("🗂 Data Room Interactive", `
      Chaque deal M&amp;A/LBO génère une <b>Data Room</b> avec 3 documents clés (bilan financier, EBITDA, dette nette). L'Analyste M&amp;A peut l'analyser pour révéler une <b>juste valeur</b> estimée et un verdict (cible sur/sous-évaluée) avant de s'engager sur le prix.
    `)}

    ${reglementSectionHtml("🤝 Négociation M&amp;A", `
      Sur un deal en cours, l'Analyste peut ouvrir un <b>canal de négociation</b> de 3 minutes pour s'accorder sur le prix par action avec la contrepartie du deal — chaque offre est comparée à la position adverse, qui peut contre-proposer, jusqu'à accord ou expiration de la fenêtre.
    `)}

    ${reglementSectionHtml("📢 M&amp;A Breakthrough", `
      Quand un deal suffisamment important (≥ 300 M$) est signé et exécuté, une <b>annonce de marché globale</b> s'affiche pour tous les joueurs, avec une hausse ou une baisse immédiate du cours d'une action liée au secteur du deal.
    `)}

    ${reglementSectionHtml("⌨️ Terminal Financier — raccourcis & interface", `
      L'interface adopte un style terminal professionnel sombre. Des raccourcis clavier permettent de changer de page instantanément : <b>F1</b> Terminal Chat, <b>F2</b> Marchés, <b>F3</b> RH, <b>F4</b> M&amp;A (désactivés pendant la saisie dans un champ de texte).
    `)}

    ${reglementSectionHtml("🔊 Ambiance sonore", `
      Un bruit d'ambiance léger de salle de marché tourne en fond sur la page Marchés, ponctué d'effets sonores : <b>clochette de bourse</b> sur un gros deal clos, <b>bip d'urgence</b> sur une alerte Risk (Margin Call, Kill Switch, audit), <b>bruit de tampon</b> sur une embauche RH. Réglable dans les Paramètres ci-dessous.
    `)}

    ${reglementSectionHtml("🔔 Notifications Flash", `
      Une pop-up discrète apparaît en haut à droite dès qu'un collègue ou une IA réalise une action d'impact dans la banque (deal, alerte, embauche, crise…) — reprend le même flux que le fil d'équipe.
    `)}

    ${reglementSectionHtml("🕐 Journées de Bourse & Cérémonie des Trophées", `
      Une session complète dure <b>4 Journées de Bourse</b> de 15 minutes réelles (1h de jeu). À la clôture de la 4ᵉ journée, la partie se fige et une <b>Cérémonie des Trophées</b> récompense : <b>Banque de l'Année</b> (P&amp;L le plus élevé), <b>Dealmaker of the Year</b> (plus gros volume M&amp;A géré), <b>Star Trader</b> (meilleur P&amp;L de trading), <b>Meilleur Employeur</b> (RH avec le plus d'actions positives envers ses équipes).
    `)}

    ${reglementSectionHtml("💾 Sauvegarde & Historique", `
      Le Hall of Fame et le résultat de chaque Cérémonie des Trophées sont enregistrés pour préserver l'historique et la réputation des joueurs de partie en partie, y compris après une réinitialisation ou un redémarrage du serveur.
    `)}

    ${reglementSectionHtml("📟 Terminal Financier — Ticker Tape mondial", `
      Un bandeau défilant en haut de l'écran, visible sur toutes les pages, affiche 4 indices dérivés du marché en temps réel (S&amp;P 500, EUR/USD, Taux US 10Y, Brent) ainsi que l'heure locale des 4 grandes places financières (New York, Londres, Tokyo, Hong Kong). Ces indices sont calculés à partir des instruments déjà simulés par le jeu (aucun flux de marché externe n'est appelé).
    `)}

    ${reglementSectionHtml("⚡ Micro-interactions", `
      Les chiffres clés (cours d'un instrument, P&amp;L, capital alloué…) flashent brièvement en vert ou en rouge dès qu'ils viennent de changer — un repère visuel rapide plutôt qu'une simple mise à jour silencieuse.
    `)}

    ${reglementSectionHtml("🌍 Global Footprint — présence mondiale multi-entités", `
      Blackwell &amp; Co opère désormais à travers <b>4 entités juridiques régionales</b> : Blackwell &amp; Co Capital, N.A. (New York, Amériques), Blackwell &amp; Co Europe SE (Francfort, Europe), Blackwell &amp; Co International Bank (Londres, Europe) et Blackwell &amp; Co Securities Asia (Hong Kong, Asie-Pacifique) — plus de 300 000 collaborateurs au total. Chaque entité a ses propres effectifs, régulateur local, capital alloué, ratio CET1, P&amp;L régional, coût de masse salariale et desks actifs, modifiables par le <b>Head of CIB</b>, la <b>DRH Global</b> (Director et grades supérieurs, RH &amp; Communication) ou le <b>Board Of Directors</b>.<br/>
      La page affiche une <b>carte du monde</b> où chaque hub s'allume selon son activité et son statut d'ouverture de marché (calculé sur les heures d'ouverture locales réelles de chaque fuseau horaire).<br/>
      <b>Transferts inter-entités :</b> les managers autorisés peuvent transférer du capital d'une entité à une autre (liquidité overnight). Si l'entité européenne ne dispose pas d'assez de fonds propres pour couvrir un gros deal M&amp;A en cours d'exécution, le siège de New York <b>injecte automatiquement</b> le capital manquant via une transaction intra-groupe.
    `)}

    ${reglementSectionHtml("🤖 Collègues IA — Heartbeat, personnalités & chat", `
      Trois collègues IA nommés travaillent en permanence à vos côtés, chacun avec son propre rythme indépendant (5 à 15 secondes) et son <b>archétype de personnalité</b>, visible sur l'Organigramme (page RH) :
      <ul style="margin:8px 0 0 18px; padding:0;">
        <li><b>🤠 Marcus Chen — Trader IA (The Cowboy)</b> : agressif, répond aux RFQ et prend des positions plus grosses, très rapide mais parfois hors de la fourchette de prix acceptable.</li>
        <li><b>🤝 Julien Beaumont — Analyste M&amp;A IA (The Dealmaker)</b> : soumet des offres de Pitchbook et fait avancer les deals en cours, charismatique en origination.</li>
        <li><b>🏛 Elena Kowalski — Risk Manager IA (The Institutional)</b> : conservatrice, revoit la VaR, relance un Risk Manager humain qui tarde à trancher un dossier (au-delà de 15s) et tranche elle-même au-delà de 30s si personne n'a agi.</li>
      </ul>
      Ces trois collègues postent leurs actions dans le <b>Chat d'équipe</b> (Vue d'ensemble et Terminal Chat) — succès, alertes urgentes (ex. VaR hors limite avec 30s pour couvrir), relances amicales. Le Chat d'équipe accepte désormais aussi vos propres messages : mentionnez <b>@trading</b>, <b>@ma</b>, <b>@risk</b> ou le prénom d'un agent pour obtenir une réponse rapide et réaliste.
    `)}

    ${reglementSectionHtml("🔻 Vente à découvert (Short)", `
      Le Desk Marchés peut désormais ouvrir des positions <b>courtes</b> en plus des positions longues (choix « Long »/« Short » à l'ouverture) — une position courte gagne quand le cours baisse, et perd quand il monte.
    `)}

    ${reglementSectionHtml("🏦 Banques Concurrentes agressives", `
      Les banques rivales ne se contentent plus d'un score au classement :
      <ul style="margin:8px 0 0 18px; padding:0;">
        <li><b>Guerre des Mandats</b> : sur chaque mandat M&amp;A ou émission obligataire mis en concurrence (Pitchbook), les banques rivales soumettent déjà leur offre dès l'ouverture du mandat — la concurrence est immédiate, pas une formalité de fin de fenêtre.</li>
        <li><b>Chasse aux têtes (Poaching)</b> : si la satisfaction moyenne de vos équipes connectées chute trop bas, une banque rivale tente de débaucher un(e) employé(e) humain(e) ou un collègue IA. La RH a 60 secondes pour contre-offrir une revalorisation salariale (page RH) — sans réaction, un joueur humain garde son poste mais voit sa satisfaction chuter, tandis qu'un collègue IA est effectivement remplacé par un(e) nouvel(le) arrivant(e).</li>
        <li><b>Short Squeeze</b> : si une position courte visible dépasse 150 M$, une banque rivale peut tenter de faire sauter les stops — le cours de l'instrument bondit brutalement et la position est liquidée d'office à perte.</li>
      </ul>
    `)}

    ${reglementSectionHtml("🏛 Banque Centrale &amp; Politique Monétaire", `
      Une IA Fed et une IA BCE annoncent périodiquement (toutes les 3 à 5 minutes) une décision de taux directeur et une lecture d'inflation. Ces décisions déplacent directement deux instruments réellement négociables — <b>US 10Y</b> et <b>Euribor 3M</b> — sur lesquels le Desk Trading <b>et</b> la Trésorerie de Groupe (accès Marchés élargi) peuvent ouvrir des positions pour en tirer parti. Chaque décision crée aussi une onde de choc sur le reste du marché (obligations, actions, cryptoactifs) proportionnelle à son ampleur.
    `)}

    ${reglementSectionHtml("📐 Regulatory Stress Testing &amp; Basel Ratios", `
      Un régulateur IA contrôle toutes les 90 à 150 secondes le ratio Tier 1 de chacune des 4 entités régionales (Global Footprint) face au minimum Basel (10,5%). Une entité non conforme subit immédiatement une <b>pénalité de fonds propres</b> (5% de son capital alloué) et déclenche une <b>restriction de distribution de bonus</b> pour toute la banque pendant quelques minutes — CIB Bonus Pool et primes RH inclus. Le ratio Tier 1 de chaque entité reste modifiable depuis la page Global Footprint : le meilleur levier pour éviter — ou sortir — d'un Stress Test raté.
    `)}

    <div class="panel">
      <div class="panel-title">⚙️ Paramètres</div>
      <div class="form-row" style="align-items:center;">
        <label style="flex:1;">Notifications (toasts) pour l'activité hors de la page en cours</label>
        <input type="checkbox" id="reglement-notif-toggle" ${notificationsDisabled ? "" : "checked"}/>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin:6px 0 14px;">Décochez pour couper les petites notifications qui apparaissent en haut à droite. Ce réglage est local à votre navigateur.</div>
      <div class="form-row" style="align-items:center;">
        <label style="flex:1;">Sons (clochette, bip d'urgence, tampon RH, ambiance salle de marché)</label>
        <input type="checkbox" id="reglement-sound-toggle" ${localStorage.getItem(SOUND_DISABLED_KEY) === "1" ? "" : "checked"}/>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin:6px 0 14px;">Décochez pour couper tous les effets sonores. Ce réglage est local à votre navigateur.</div>
      <div class="form-row" style="align-items:center;">
        <label style="flex:1;">Difficulté actuelle de la partie</label>
        <span class="chip">${escapeHtml(difficultyLabel)}</span>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin:6px 0 14px;">Réglable par le Board Of Directors depuis le Comité de Direction.</div>
      <button id="reglement-replay-tutorial" class="btn-sm">Revoir le message d'accueil</button>
    </div>
  `;
}

function bindReglement() {
  const toggle = document.getElementById("reglement-notif-toggle");
  if (toggle) toggle.addEventListener("change", () => {
    if (toggle.checked) localStorage.removeItem(NOTIFICATIONS_DISABLED_KEY);
    else localStorage.setItem(NOTIFICATIONS_DISABLED_KEY, "1");
  });
  const soundToggle = document.getElementById("reglement-sound-toggle");
  if (soundToggle) soundToggle.addEventListener("change", () => {
    if (soundToggle.checked) localStorage.removeItem(SOUND_DISABLED_KEY);
    else localStorage.setItem(SOUND_DISABLED_KEY, "1");
  });
  const replayBtn = document.getElementById("reglement-replay-tutorial");
  if (replayBtn) replayBtn.addEventListener("click", () => {
    localStorage.removeItem(TUTORIAL_SEEN_KEY);
    maybeShowTutorial();
  });
}

PAGE_RENDERERS.reglement = renderReglement;
PAGE_BINDERS.reglement = bindReglement;
