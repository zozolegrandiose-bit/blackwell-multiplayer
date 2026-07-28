const appState = {
  player: null,
  currentPage: "overview",
  players: [],
  activityLog: [],
  mail: [],
  maDeals: [],
  clients: [],
  complianceItems: [],
  hr: { leaveRequests: [] },
  hrRoster: [],
  financeKPIs: {},
  agenda: [],
  documents: [],
  expenseReports: [],
  playerScores: {},
  bankHealth: 100,
  bankrupt: false,
  activeEvents: [],
  campaignGoal: { targetAUM: 500000, maxQuarters: 20 },
  victory: false,
  currentQuarter: 1,
  taskQueue: [],
  tasksSummary: {},
  quarterHistory: [],
  hallOfFame: [],
  paused: false,
  difficulty: "standard",
  markets: { instruments: [], positions: [], cash: 0, realizedPnL: 0, tradeLog: [] },
  hedgingRequests: [],
  structuredProducts: [],
  directive: null,
  liveEvents: [],
  executedWorkflows: [],
  teamChat: [],
  leagueTable: {},
  marketDay: { dayNumber: 1, deadline: null },
  warRoom: null,
  repoStatus: { blocked: false, blockedSince: null, emergencyFacilityUsed: 0 },
  rivalTalent: null,
  mercatoOffers: [],
  creditRatings: {},
  cibBonusPool: { available: 0, periodNumber: 1, distributedLog: [] },
  cibLeadership: { holderPlayerId: null, holderName: null, consecutiveBadCycles: 0, appointedAt: null },
  pitchbookCompetitions: [],
  ipo: null,
  terminalDMs: [],
  terminalDealsFeed: []
};

const PAGE_RENDERERS = {};
const PAGE_BINDERS = {};

const EVENT_TYPE_ICONS = {
  regulatory: "🚨",
  client_unhappy: "😠",
  market_crash: "📉",
  opportunity: "⭐",
  competing_bid: "⚔️"
};

// Toasts + tab-title flash: lightweight awareness for activity happening on pages
// the player isn't currently looking at — the toast container lives outside #app
// so it survives renderApp()'s innerHTML replacement.
const NOTIFICATIONS_DISABLED_KEY = "blackwell_notifications_disabled";

function notify(message) {
  if (localStorage.getItem(NOTIFICATIONS_DISABLED_KEY) === "1") return;
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

const ORIGINAL_TITLE = document.title;
let titleFlashInterval = null;

function startTitleFlash(flashText) {
  if (titleFlashInterval) return;
  let on = false;
  titleFlashInterval = setInterval(() => {
    document.title = on ? ORIGINAL_TITLE : flashText;
    on = !on;
  }, 1000);
}

function stopTitleFlash() {
  if (!titleFlashInterval) return;
  clearInterval(titleFlashInterval);
  titleFlashInterval = null;
  document.title = ORIGINAL_TITLE;
}

window.addEventListener("focus", stopTitleFlash);

const TUTORIAL_SEEN_KEY = "blackwell_tutorial_seen";

function maybeShowTutorial() {
  const overlay = document.getElementById("tutorial-overlay");
  if (!overlay || localStorage.getItem(TUTORIAL_SEEN_KEY)) return;
  overlay.innerHTML = `
    <div class="tutorial-modal">
      <h2>Bienvenue à la direction de Blackwell &amp; Co Capital</h2>
      <p>Vous ne partez pas de zéro : vous reprenez une banque d'investissement en pleine activité, avec des années d'historique — des clients déjà en portefeuille, des deals en cours, un bilan, une équipe, et quelques dossiers laissés en plan par la direction précédente. À vous de la faire tourner, avec d'autres joueurs, en temps réel.</p>
      <p><b>Par où commencer ?</b> Sur Vue d'ensemble, le panneau <b>🧭 Priorités</b> vous dit en direct ce qui a besoin d'attention là, maintenant — cliquez dessus pour aller droit au but. Il ne sera jamais vide bien longtemps.</p>
      <ul>
        <li><b>Comité de Direction</b> — chaque trimestre, votre département verrouille une décision stratégique à compromis (pas de bon choix évident, que des arbitrages).</li>
        <li><b>Pages opérationnelles</b> (M&amp;A, Clients, Conformité, RH, Finance) — vous héritez de dossiers réels : deals à faire avancer, clients à suivre, alertes à traiter, postes à pourvoir, budgets à corriger. En plus, de petites tâches ⚡ apparaissent en continu.</li>
        <li><b>Rien n'attend patiemment</b> : un deal qu'on laisse traîner peut tomber à l'eau, un client délaissé peut partir, une alerte non traitée coûte une amende au trimestre suivant.</li>
        <li>Votre <b>score</b>, vos <b>badges</b> et le <b>Hall of Fame</b> (qui survit aux resets) sont sur Vue d'ensemble.</li>
      </ul>
      <button id="tutorial-dismiss" class="btn-sm">J'ai compris, on y va</button>
    </div>
  `;
  document.getElementById("tutorial-dismiss").addEventListener("click", () => {
    localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
    overlay.innerHTML = "";
  });
}

function initApp(player, snapshot) {
  appState.player = player;
  Object.assign(appState, snapshot || {});
  if (!visibleNav(player).some(item => item.id === appState.currentPage)) {
    appState.currentPage = visibleNav(player)[0] ? visibleNav(player)[0].id : "overview";
  }
  renderApp();
  maybeShowTutorial();
  renderWarRoomOverlay();
}

// War Room (Crise Majeure) is a global, all-hands overlay — kept in its own
// persistent DOM node (like #tutorial-overlay) instead of inside renderApp()'s
// innerHTML, so it survives page navigation and doesn't need rebinding on
// every unrelated socket update.
let warRoomTickInterval = null;

function renderWarRoomOverlay() {
  const overlay = document.getElementById("warroom-overlay");
  if (!overlay) return;
  const warRoom = appState.warRoom;
  if (!warRoom) {
    overlay.innerHTML = "";
    if (warRoomTickInterval) { clearInterval(warRoomTickInterval); warRoomTickInterval = null; }
    return;
  }

  const player = appState.player;
  const labels = (typeof OVERVIEW_CLUSTER_LABELS !== "undefined") ? OVERVIEW_CLUSTER_LABELS : {};
  const clusters = ["A", "B", "C", "D", "E", "F", "G"];
  const alreadyValidated = player && player.cluster && warRoom.respondedClusters.includes(player.cluster);

  overlay.innerHTML = `
    <div class="warroom-modal">
      <h2>🆘 Crise Majeure</h2>
      <p>${escapeHtml(warRoom.label)} Chaque département doit valider une action critique avant la fin du chrono.</p>
      <div class="warroom-countdown" id="warroom-countdown-text">--</div>
      <div class="warroom-clusters">
        ${clusters.map(c => `
          <div class="warroom-cluster-chip ${warRoom.respondedClusters.includes(c) ? "done" : ""} ${player && player.cluster === c ? "mine" : ""}">
            ${warRoom.respondedClusters.includes(c) ? "✅" : "⏳"} ${escapeHtml(labels[c] || c)}
          </div>
        `).join("")}
      </div>
      <div class="warroom-actions">
        ${!player || !player.cluster ? "" : alreadyValidated
          ? `<div class="warroom-validated-msg">✅ Votre département a validé son action — en attente des autres.</div>`
          : `<button id="btn-warroom-validate" class="btn-sm">Valider l'action critique de mon département</button>`}
      </div>
    </div>
  `;

  const btn = document.getElementById("btn-warroom-validate");
  if (btn) btn.addEventListener("click", () => socket.emit("warRoom:validate"));

  function tick() {
    const el = document.getElementById("warroom-countdown-text");
    if (!el || !appState.warRoom) return;
    const remaining = Math.max(0, Math.round((appState.warRoom.deadline - Date.now()) / 1000));
    el.textContent = "⏱ " + remaining + "s";
  }
  tick();
  if (warRoomTickInterval) clearInterval(warRoomTickInterval);
  warRoomTickInterval = setInterval(tick, 1000);
}

function switchPage(pageId) {
  appState.currentPage = pageId;
  renderApp();
}

function renderApp() {
  const app = document.getElementById("app");
  const player = appState.player;
  const nav = visibleNav(player);
  const renderer = PAGE_RENDERERS[appState.currentPage];
  app.innerHTML = `
    <div class="app-shell">
      <div class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-title">Blackwell &amp; Co</div>
          <div class="person-row" style="margin-top:10px;">
            ${avatarHtml(player.fullName, 32)}
            <div>
              <div class="sidebar-user">${escapeHtml(player.fullName)}</div>
              <div class="sidebar-role">${escapeHtml(player.grade)}</div>
            </div>
          </div>
          <div class="online-indicator"><span class="online-dot"></span>${appState.players.length} joueur${appState.players.length > 1 ? "s" : ""} en ligne</div>
        </div>
        <div class="sidebar-nav">
          ${nav.map(item => `
            <div class="sidebar-nav-item ${item.id === appState.currentPage ? "active" : ""}" data-nav-page="${item.id}">
              <span class="sidebar-nav-icon">${item.icon}</span> ${escapeHtml(item.label)}
            </div>
          `).join("")}
        </div>
      </div>
      <div class="main-content">
        ${appState.directive ? `
          <div class="event-banner">
            <div>📢 <b>Priorité de la direction : ${escapeHtml((typeof OVERVIEW_CLUSTER_LABELS !== "undefined" && OVERVIEW_CLUSTER_LABELS[appState.directive.cluster]) || appState.directive.cluster)}</b> — +50% de points pour ce département tant que la directive tient.</div>
          </div>
        ` : ""}
        ${appState.repoStatus && appState.repoStatus.blocked ? `
          <div class="bankruptcy-banner">
            <div>🚫 <b>Marché interbancaire fermé.</b> Les lignes de crédit Repo sont coupées — le Desk Marchés ne peut plus ouvrir de nouvelles positions, jusqu'à ce que la santé de la banque remonte ou que la Banque Centrale intervienne.</div>
            ${player.hasFullAccess ? `<button id="btn-central-bank-facility" class="btn-sm">🏦 Guichet d'urgence (coût réel)</button>` : ""}
          </div>
        ` : ""}
        ${appState.paused ? `
          <div class="event-banner">
            <div>⏸ <b>Partie en pause.</b> Toutes les mécaniques temporisées sont figées${player.hasFullAccess ? " — utilisez le panneau GM sur Comité de Direction pour reprendre." : "."}</div>
          </div>
        ` : ""}
        ${appState.victory ? `
          <div class="victory-banner">
            <div>🎉 <b>Victoire !</b> L'objectif de ${fmtMoney(appState.campaignGoal.targetAUM)} d'AUM est atteint.</div>
            ${player.hasFullAccess ? `<button id="btn-game-reset" class="btn-sm">Nouvelle partie</button>` : `<span style="font-size:11.5px; color:var(--text-muted);">Seul le Board Of Directors peut relancer une partie.</span>`}
          </div>
        ` : appState.bankrupt ? `
          <div class="bankruptcy-banner">
            <div>💥 <b>Faillite de la banque.</b> La santé de la banque est tombée à zéro — la partie est terminée.</div>
            ${player.hasFullAccess ? `<button id="btn-game-reset" class="btn-sm">Nouvelle partie</button>` : `<span style="font-size:11.5px; color:var(--text-muted);">Seul le Board Of Directors peut relancer une partie.</span>`}
          </div>
        ` : ""}
        ${(appState.activeEvents || []).map(ev => `
          <div class="event-banner">
            <div>${EVENT_TYPE_ICONS[ev.type] || "⚠️"} <b>${escapeHtml(ev.label)}</b> — ${escapeHtml(ev.description)}</div>
            ${ev.deadline ? `<div class="event-banner-deadline">⏱ ${Math.max(0, Math.round((ev.deadline - Date.now()) / 1000))}s</div>` : ""}
          </div>
        `).join("")}
        ${renderer ? renderer() : `<div class="page-empty">Page indisponible.</div>`}
      </div>
    </div>
  `;
  bindApp();
}

function bindApp() {
  document.querySelectorAll("[data-nav-page]").forEach(el => {
    el.addEventListener("click", () => switchPage(el.getAttribute("data-nav-page")));
  });
  const resetBtn = document.getElementById("btn-game-reset");
  if (resetBtn) resetBtn.addEventListener("click", () => socket.emit("game:requestReset"));
  const centralBankBtn = document.getElementById("btn-central-bank-facility");
  if (centralBankBtn) centralBankBtn.addEventListener("click", () => socket.emit("game:useCentralBankFacility"));
  const binder = PAGE_BINDERS[appState.currentPage];
  if (binder) binder();
}
