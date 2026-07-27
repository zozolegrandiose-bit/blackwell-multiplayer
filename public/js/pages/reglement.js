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
        <li><b>G — Direction Générale</b> : accès complet à toutes les pages</li>
      </ul>
      Les pages Vue d'ensemble, Mail, Agenda, Documents, Notes de frais et ce Règlement sont accessibles à tout le monde. <b>Le Comité de Direction (Stratégie) est réservé</b> : il faut être Director ou grade supérieur dans son département, ou appartenir à la Direction Générale.
    `)}

    ${reglementSectionHtml("🏛 Comité de Direction (décisions trimestrielles)", `
      La partie avance par trimestres. Chaque département opérationnel (clusters A à F) verrouille <b>une décision à compromis</b> par trimestre (ex : pipeline agressif vs défensif). Sans personne d'assez senior connecté, l'option neutre s'applique par défaut — rien ne bloque.<br/>
      La <b>Direction Générale</b> voit les choix déjà verrouillés des autres avant de fixer son propre multiplicateur trimestriel (Croissance, Stabilité, Réduction des coûts) — un vrai levier qui amplifie ou atténue l'effet cumulé du trimestre.
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
      Chaque action significative (pas chaque clic) rapporte des points, avec un multiplicateur de +50% si votre département est sous une <b>directive prioritaire</b> de la Direction Générale. Des badges (🏅 Clôtureur, 🛡️ Bouclier, 🎯 Recruteur…) se débloquent automatiquement selon vos actions. Le Hall of Fame conserve les meilleurs scores même après une réinitialisation de partie.
    `)}

    <div class="panel">
      <div class="panel-title">⚙️ Paramètres</div>
      <div class="form-row" style="align-items:center;">
        <label style="flex:1;">Notifications (toasts) pour l'activité hors de la page en cours</label>
        <input type="checkbox" id="reglement-notif-toggle" ${notificationsDisabled ? "" : "checked"}/>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin:6px 0 14px;">Décochez pour couper les petites notifications qui apparaissent en haut à droite. Ce réglage est local à votre navigateur.</div>
      <div class="form-row" style="align-items:center;">
        <label style="flex:1;">Difficulté actuelle de la partie</label>
        <span class="chip">${escapeHtml(difficultyLabel)}</span>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin:6px 0 14px;">Réglable par la Direction Générale depuis le Comité de Direction.</div>
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
  const replayBtn = document.getElementById("reglement-replay-tutorial");
  if (replayBtn) replayBtn.addEventListener("click", () => {
    localStorage.removeItem(TUTORIAL_SEEN_KEY);
    maybeShowTutorial();
  });
}

PAGE_RENDERERS.reglement = renderReglement;
PAGE_BINDERS.reglement = bindReglement;
