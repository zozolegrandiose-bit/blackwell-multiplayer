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
  tasksSummary: {}
};

const PAGE_RENDERERS = {};
const PAGE_BINDERS = {};

function initApp(player, snapshot) {
  appState.player = player;
  Object.assign(appState, snapshot || {});
  if (!visibleNav(player).some(item => item.id === appState.currentPage)) {
    appState.currentPage = visibleNav(player)[0] ? visibleNav(player)[0].id : "overview";
  }
  renderApp();
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
        ${appState.victory ? `
          <div class="victory-banner">
            <div>🎉 <b>Victoire !</b> L'objectif de ${fmtMoney(appState.campaignGoal.targetAUM)} d'AUM est atteint.</div>
            ${player.hasFullAccess ? `<button id="btn-game-reset" class="btn-sm">Nouvelle partie</button>` : `<span style="font-size:11.5px; color:var(--text-muted);">Seule la Direction Générale peut relancer une partie.</span>`}
          </div>
        ` : appState.bankrupt ? `
          <div class="bankruptcy-banner">
            <div>💥 <b>Faillite de la banque.</b> La santé de la banque est tombée à zéro — la partie est terminée.</div>
            ${player.hasFullAccess ? `<button id="btn-game-reset" class="btn-sm">Nouvelle partie</button>` : `<span style="font-size:11.5px; color:var(--text-muted);">Seule la Direction Générale peut relancer une partie.</span>`}
          </div>
        ` : ""}
        ${(appState.activeEvents || []).map(ev => `
          <div class="event-banner">
            <div>${ev.type === "regulatory" ? "🚨" : ev.type === "client_unhappy" ? "😠" : "⭐"} <b>${escapeHtml(ev.label)}</b> — ${escapeHtml(ev.description)}</div>
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
  const binder = PAGE_BINDERS[appState.currentPage];
  if (binder) binder();
}
