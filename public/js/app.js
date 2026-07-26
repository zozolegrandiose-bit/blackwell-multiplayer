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
  expenseReports: []
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
  const binder = PAGE_BINDERS[appState.currentPage];
  if (binder) binder();
}
