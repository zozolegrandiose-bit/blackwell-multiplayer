let joinData = { grades: [], departments: [], takenSlots: [] };

function slotTaken(grade, dept) {
  return joinData.takenSlots.some(s => s.grade === grade && s.dept === dept);
}

function renderJoinScreen() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="join-screen">
      <h1>Blackwell &amp; Co Capital</h1>
      <p class="join-sub">Créez votre personnage pour rejoindre la partie.</p>
      <div class="form-row">
        <label>Prénom</label>
        <input id="join-firstname" type="text" placeholder="Prénom"/>
      </div>
      <div class="form-row">
        <label>Nom</label>
        <input id="join-lastname" type="text" placeholder="Nom"/>
      </div>
      <div class="form-row">
        <label>Grade</label>
        <select id="join-grade">
          ${joinData.grades.map(g => `<option value="${g}">${g}</option>`).join("")}
        </select>
      </div>
      <div class="form-row">
        <label>Département</label>
        <select id="join-dept">
          ${joinData.departments.map(d => `<option value="${d}">${d}</option>`).join("")}
        </select>
      </div>
      <div id="join-error" class="join-error"></div>
      <button id="join-submit" class="btn-brass">Rejoindre la partie</button>
      <div class="join-players">
        <div class="join-players-title">Joueurs connectés (${joinData.players.length})</div>
        ${joinData.players.map(p => `<div class="join-player-row">${p.fullName} — ${p.grade}, ${p.dept}</div>`).join("") || `<div class="join-players-empty">Personne pour l'instant.</div>`}
      </div>
    </div>
  `;
  bindJoinScreen();
}

function checkSlotAvailability() {
  const grade = document.getElementById("join-grade").value;
  const dept = document.getElementById("join-dept").value;
  const errorEl = document.getElementById("join-error");
  const submitBtn = document.getElementById("join-submit");
  if (slotTaken(grade, dept)) {
    errorEl.textContent = "Ce poste est déjà occupé — choisissez un autre grade ou département.";
    submitBtn.disabled = true;
  } else {
    errorEl.textContent = "";
    submitBtn.disabled = false;
  }
}

function bindJoinScreen() {
  document.getElementById("join-grade").addEventListener("change", checkSlotAvailability);
  document.getElementById("join-dept").addEventListener("change", checkSlotAvailability);
  document.getElementById("join-submit").addEventListener("click", () => {
    const firstName = document.getElementById("join-firstname").value.trim();
    const lastName = document.getElementById("join-lastname").value.trim();
    const grade = document.getElementById("join-grade").value;
    const dept = document.getElementById("join-dept").value;
    if (!firstName || !lastName) {
      document.getElementById("join-error").textContent = "Prénom et nom requis.";
      return;
    }
    socket.emit("join:claim", { firstName, lastName, grade, dept });
  });
}

socket.on("join:roster", data => {
  joinData = data;
  renderJoinScreen();
});

socket.on("roster:update", data => {
  if (window.currentPlayer) {
    appState.players = data.players;
    if (appState.currentPage === "overview") renderApp();
    return;
  }
  joinData.players = data.players;
  joinData.takenSlots = data.players.map(p => ({ grade: p.grade, dept: p.dept }));
  renderJoinScreen();
});

socket.on("join:claim:rejected", data => {
  joinData.takenSlots = data.takenSlots;
  const errorEl = document.getElementById("join-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("join:success", data => {
  window.currentPlayer = data.player;
  initApp(data.player, data.snapshot);
});

socket.on("mail:new", message => {
  if (!window.currentPlayer) return;
  appState.mail.push(message);
  if (appState.currentPage === "mail") renderApp();
});

socket.on("mail:send:rejected", data => {
  const errorEl = document.getElementById("mail-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("ma:update", deals => {
  if (!window.currentPlayer) return;
  appState.maDeals = deals;
  if (appState.currentPage === "ma") renderApp();
});

socket.on("ma:create:rejected", data => {
  const errorEl = document.getElementById("ma-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("clients:update", clients => {
  if (!window.currentPlayer) return;
  appState.clients = clients;
  if (appState.currentPage === "clients") renderApp();
});

socket.on("clients:create:rejected", data => {
  const errorEl = document.getElementById("cl-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("compliance:update", items => {
  if (!window.currentPlayer) return;
  appState.complianceItems = items;
  if (appState.currentPage === "compliance") renderApp();
});

socket.on("compliance:create:rejected", data => {
  const errorEl = document.getElementById("cp-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("hr:update", hr => {
  if (!window.currentPlayer) return;
  appState.hr = hr;
  if (appState.currentPage === "hr") renderApp();
});

socket.on("hr:rosterUpdate", hrRoster => {
  if (!window.currentPlayer) return;
  appState.hrRoster = hrRoster;
  if (appState.currentPage === "hr") renderApp();
});

socket.on("hr:requestLeave:rejected", data => {
  const errorEl = document.getElementById("hr-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("finance:update", kpis => {
  if (!window.currentPlayer) return;
  appState.financeKPIs = kpis;
  if (appState.currentPage === "finance") renderApp();
});

socket.on("overview:kpis", kpis => {
  if (!window.currentPlayer) return;
  appState.financeKPIs = kpis;
  if (appState.currentPage === "overview") renderApp();
});

socket.on("agenda:update", agenda => {
  if (!window.currentPlayer) return;
  appState.agenda = agenda;
  if (appState.currentPage === "agenda") renderApp();
});

socket.on("agenda:create:rejected", data => {
  const errorEl = document.getElementById("ag-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("documents:update", docs => {
  if (!window.currentPlayer) return;
  appState.documents = docs;
  if (appState.currentPage === "documents") renderApp();
});

socket.on("documents:upload:rejected", data => {
  const errorEl = document.getElementById("doc-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("expenses:update", reports => {
  if (!window.currentPlayer) return;
  appState.expenseReports = reports;
  if (appState.currentPage === "expenses") renderApp();
});

socket.on("expenses:submit:rejected", data => {
  const errorEl = document.getElementById("exp-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("scoring:update", data => {
  if (!window.currentPlayer) return;
  appState.playerScores = data.playerScores;
  appState.bankHealth = data.bankHealth;
  if (appState.currentPage === "overview") renderApp();
});

socket.on("events:update", events => {
  if (!window.currentPlayer) return;
  appState.activeEvents = events;
  renderApp();
});

socket.on("event:triggered", () => {
  if (!window.currentPlayer) return;
  renderApp();
});

socket.on("event:resolved", () => {
  if (!window.currentPlayer) return;
  renderApp();
});

socket.on("event:expired", () => {
  if (!window.currentPlayer) return;
  renderApp();
});

socket.on("game:bankrupt", () => {
  if (!window.currentPlayer) return;
  appState.bankrupt = true;
  renderApp();
});

socket.on("game:reset", data => {
  if (!window.currentPlayer) return;
  window.currentPlayer = data.player;
  initApp(data.player, data.snapshot);
});

socket.on("activity:update", entry => {
  if (!window.currentPlayer) return;
  appState.activityLog.unshift(entry);
  if (appState.activityLog.length > 200) appState.activityLog.length = 200;
  if (appState.currentPage === "overview") renderApp();
});
