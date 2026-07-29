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
  rfqRequests: [],
  pendingHedges: [],
  directive: null,
  liveEvents: [],
  executedWorkflows: [],
  teamChat: [],
  leagueTable: {},
  marketDay: { dayNumber: 1, deadline: null },
  warRoom: null,
  repoStatus: { blocked: false, blockedSince: null, emergencyFacilityUsed: 0 },
  marginCall: { active: false, deadline: null, requiredAmount: 0 },
  sessionEnded: false,
  trophies: null,
  rivalTalent: null,
  mercatoOffers: [],
  creditRatings: {},
  cibBonusPool: { available: 0, periodNumber: 1, distributedLog: [] },
  cibLeadership: { holderPlayerId: null, holderName: null, consecutiveBadCycles: 0, appointedAt: null },
  pitchbookCompetitions: [],
  ipo: null,
  terminalDMs: [],
  terminalDealsFeed: [],
  globalBank: { bankName: "Blackwell & Co Capital", totalGlobalHeadcount: 0, globalPnL: 0, globalTier1CapitalRatio: 0, entities: [] },
  publicTicker: [],
  aiAgents: [],
  poachingAttempts: []
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

// M&A Breakthrough -- a brief, dramatic global flash (not persisted state, no
// snapshot field) shown to every connected player the instant a big deal clears
// Risk, distinct from the quieter team-chat congrats message that also fires.
function showMaBreakthrough(data) {
  const overlay = document.getElementById("ma-breakthrough-overlay");
  if (!overlay) return;
  const up = data.changePct >= 0;
  overlay.innerHTML = `
    <div class="ma-breakthrough-banner">
      <div class="ma-breakthrough-title">🚀 M&amp;A BREAKTHROUGH</div>
      <div class="ma-breakthrough-body">« ${escapeHtml(data.dealName)} » (${fmtMoney(data.valuation)}) vient de se conclure !</div>
      <div class="ma-breakthrough-price">${escapeHtml(data.instrumentName)} ${up ? "📈" : "📉"} ${up ? "+" : ""}${data.changePct}% (${data.oldPrice} → ${data.newPrice})</div>
    </div>
  `;
  setTimeout(() => { overlay.innerHTML = ""; }, 6000);
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
  renderGlobalTicker();
  maybeShowTutorial();
  renderWarRoomOverlay();
  renderTrophyOverlay(appState.sessionEnded ? appState.trophies : null);
}

// War Room (Crise Majeure) is a global, all-hands overlay — kept in its own
// persistent DOM node (like #tutorial-overlay) instead of inside renderApp()'s
// innerHTML, so it survives page navigation and doesn't need rebinding on
// every unrelated socket update.
let warRoomTickInterval = null;

// Cérémonie des Trophées -- shown once the 4th Journée de Bourse closes
// (server/trophies.js). Persistent overlay div, same convention as the War Room
// modal, so it survives page navigation and doesn't need renderApp() plumbing.
function renderTrophyOverlay(trophies) {
  const overlay = document.getElementById("trophy-overlay");
  if (!overlay) return;
  if (!trophies) { overlay.innerHTML = ""; return; }
  const rows = [
    { icon: "🏦", label: "Banque de l'Année", entry: trophies.bankOfTheYear, fmt: v => fmtMoney(v) },
    { icon: "🤝", label: "Dealmaker of the Year", entry: trophies.dealmakerOfTheYear, fmt: v => fmtMoney(v) },
    { icon: "📈", label: "Star Trader", entry: trophies.starTrader, fmt: v => fmtMoney(v) },
    { icon: "👥", label: "Meilleur Employeur", entry: trophies.bestEmployer, fmt: v => v + " action(s) RH" }
  ];
  overlay.innerHTML = `
    <div class="warroom-modal" style="text-align:center;">
      <h2 style="justify-content:center;">🏆 Cérémonie des Trophées</h2>
      <p>Les 4 Journées de Bourse sont closes — voici le palmarès de la session.</p>
      <div style="text-align:left;">
        ${rows.map(r => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px solid var(--border);">
            <span style="font-size:13px;">${r.icon} <b>${r.label}</b></span>
            <span style="font-size:13px; color:var(--series-green);">${r.entry ? escapeHtml(r.entry.name) + " — " + r.fmt(r.entry.pnl != null ? r.entry.pnl : r.entry.value) : "—"}</span>
          </div>
        `).join("")}
      </div>
      ${appState.player && appState.player.hasFullAccess ? `<button id="btn-game-reset" class="btn-sm" style="margin-top:16px;">Nouvelle partie</button>` : `<div style="font-size:11.5px; color:var(--text-muted); margin-top:16px;">Seul le Board Of Directors peut relancer une partie.</div>`}
    </div>
  `;
  const resetBtn = overlay.querySelector("#btn-game-reset");
  if (resetBtn) resetBtn.addEventListener("click", () => socket.emit("game:requestReset"));
}

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
  if (pageId === "markets") startTradingFloorAmbience();
  else stopTradingFloorAmbience();
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
        ${appState.marginCall && appState.marginCall.active ? `
          <div class="bankruptcy-banner">
            <div>🚨 <b>MARGIN CALL</b> — le book dépasse le capital disponible. Injection requise : ${fmtMoney(appState.marginCall.requiredAmount)} sous ${Math.max(0, Math.round((appState.marginCall.deadline - Date.now()) / 1000))}s, ou la position la plus risquée sera liquidée d'office.</div>
            ${(player.access || []).includes("compliance") ? `<button id="btn-inject-margin-cash" class="btn-sm">💉 Injecter ${fmtMoney(appState.marginCall.requiredAmount)}</button>` : ""}
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
  applyFlashes(app);
}

function bindApp() {
  document.querySelectorAll("[data-nav-page]").forEach(el => {
    el.addEventListener("click", () => switchPage(el.getAttribute("data-nav-page")));
  });
  const resetBtn = document.getElementById("btn-game-reset");
  if (resetBtn) resetBtn.addEventListener("click", () => socket.emit("game:requestReset"));
  const centralBankBtn = document.getElementById("btn-central-bank-facility");
  if (centralBankBtn) centralBankBtn.addEventListener("click", () => socket.emit("game:useCentralBankFacility"));
  const injectMarginBtn = document.getElementById("btn-inject-margin-cash");
  if (injectMarginBtn) injectMarginBtn.addEventListener("click", () => socket.emit("compliance:injectMarginCash"));
  const binder = PAGE_BINDERS[appState.currentPage];
  if (binder) binder();
}

// Bloomberg/FactSet-style quick navigation -- F1 News (Terminal Chat), F2 Trading
// (Marchés), F3 DRH (RH), F4 M&A, F5 Vue d'ensemble, F6 Global Footprint.
// Registered once at load (not in bindApp, which re-runs on every render) since
// it's a global window-level listener, not scoped to any rendered element.
// Silently no-ops if the player lacks access to that page, rather than switching
// to a blank/forbidden view.
const FUNCTION_KEY_PAGES = { F1: "terminal", F2: "markets", F3: "hr", F4: "ma", F5: "overview", F6: "global" };
window.addEventListener("keydown", e => {
  const targetPage = FUNCTION_KEY_PAGES[e.key];
  if (!targetPage || !window.currentPlayer) return;
  const tag = (e.target && e.target.tagName) || "";
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
  if (!appState.player || !appState.player.access.includes(targetPage)) return;
  e.preventDefault();
  switchPage(targetPage);
});
