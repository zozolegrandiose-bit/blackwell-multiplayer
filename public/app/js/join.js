// Patch 28: seats are auto-assigned server-side from the account's approved
// department/grade (Admin Panel) -- there's no more free-pick form here. If
// autoSeatAccount ever rejects a connection (an approved account somehow
// missing its assignment), show a simple error instead of a blank screen.
function renderJoinError(reason) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="join-screen">
      <h1>Blackwell &amp; Co Capital</h1>
      <div class="join-error">${reason}</div>
    </div>
  `;
}

socket.on("roster:update", data => {
  if (!window.currentPlayer) return;
  appState.players = data.players;
  if (appState.currentPage === "overview") renderApp();
});

socket.on("join:claim:rejected", data => {
  renderJoinError(data.reason);
});

socket.on("join:success", data => {
  window.currentPlayer = data.player;
  initApp(data.player, data.snapshot);
});

// Resigning (server/satisfaction.js's sweepResignations) frees the slot but keeps
// the socket connected -- send the player back to the join screen instead of a
// hard disconnect, same "resync without disconnect" spirit as game:reset.
socket.on("game:youResigned", data => {
  window.currentPlayer = null;
  socket.emit("join:request");
  notify("🚪 " + data.reason);
});

// Promotion/reassignment (server/handlers/hr.js) can change grade/dept/cluster/
// access all at once -- simplest to just replace appState.player wholesale with
// the fresh copy the server sends, then re-render (nav depends on access).
socket.on("hr:youWerePromoted", data => {
  if (!window.currentPlayer) return;
  window.currentPlayer = data.player;
  appState.player = data.player;
  notify("⬆️ Promotion : " + data.player.grade + " (" + fmtMoney(data.player.baseSalary) + "/an).");
  renderApp();
});

socket.on("hr:youWereReassigned", data => {
  if (!window.currentPlayer) return;
  window.currentPlayer = data.player;
  appState.player = data.player;
  if (!visibleNav(data.player).some(item => item.id === appState.currentPage)) {
    appState.currentPage = visibleNav(data.player)[0] ? visibleNav(data.player)[0].id : "overview";
  }
  notify("🔀 Réaffecté(e) : " + data.player.dept + ".");
  renderApp();
});

socket.on("hr:sabbaticalStarted", () => {
  notify("🌴 Vous êtes envoyé(e) en sabbatique / formation — stress en baisse.");
});

socket.on("hr:sabbaticalEnded", data => {
  notify("🌴 Retour de sabbatique — compétence désormais à " + data.newSkillRating + ".");
});

socket.on("hr:burnout", () => {
  notify("🤒 Burn-out — vous êtes en arrêt de travail forcé, votre stress était trop élevé.");
});

socket.on("hr:backFromLeave", () => {
  notify("✅ Vous reprenez le travail après votre arrêt.");
});

socket.on("hr:raiseGranted", data => {
  notify("💬 Augmentation accordée — nouveau salaire : " + fmtMoney(data.newSalary) + "/an.");
});

socket.on("hr:disciplined", data => {
  if (data.action === "blame") notify("⚠️ Vous avez reçu un blâme suite à une alerte de conformité.");
  else if (data.action === "suspend") notify("🚫 Vous êtes suspendu(e) temporairement suite à une alerte de conformité.");
});

// Termination is harsher framing than a voluntary resignation but the same
// underlying mechanic: free the slot, send the player back to the join screen
// without a hard disconnect.
socket.on("game:youWereTerminated", data => {
  window.currentPlayer = null;
  socket.emit("join:request");
  notify("⚖️ " + data.reason);
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
  if (["ma", "compliance", "markets"].includes(appState.currentPage)) renderApp();
});

socket.on("dealWorkflow:notify", data => {
  if (!window.currentPlayer) return;
  notify(data.text);
});

socket.on("executedWorkflows:update", data => {
  if (!window.currentPlayer) return;
  appState.executedWorkflows = data;
  if (appState.currentPage === "overview") renderApp();
});

// teamChat already aggregates every congrats/alert moment across the whole game
// (deals, mercato, syndication, war room, margin call, audits, burnout...) --
// the single natural hook point for widening toasts to team-impact events and
// for the Sound Design cues, rather than instrumenting each system separately.
socket.on("teamChat:update", message => {
  if (!window.currentPlayer) return;
  appState.teamChat = [message, ...(appState.teamChat || [])].slice(0, 30);
  if (appState.currentPage === "overview") renderApp();
  notify((message.tone === "alert" ? "⚠️ " : "🔔 ") + message.text);
  if (message.tone === "congrats") playBellSound();
  else if (message.tone === "alert") playAlertBeep();
});

socket.on("leagueTable:update", data => {
  if (!window.currentPlayer) return;
  appState.leagueTable = data;
  if (appState.currentPage === "overview") renderApp();
});

socket.on("marketDay:update", data => {
  if (!window.currentPlayer) return;
  appState.marketDay = data;
  if (appState.currentPage === "overview") renderApp();
});

socket.on("warRoom:update", data => {
  if (!window.currentPlayer) return;
  appState.warRoom = data;
  renderWarRoomOverlay();
});

socket.on("terminal:dm", message => {
  if (!window.currentPlayer) return;
  appState.terminalDMs = [...(appState.terminalDMs || []), message];
  if (appState.currentPage === "terminal") renderApp();
  else if (message.fromPlayerId !== appState.player.id) notify("💬 " + message.fromName + " : " + message.body);
});

socket.on("terminal:sendDM:rejected", data => {
  const errEl = document.getElementById("terminal-dm-error");
  if (errEl) errEl.textContent = data.reason;
});

socket.on("terminal:dealsFeedUpdate", entry => {
  if (!window.currentPlayer) return;
  appState.terminalDealsFeed = [entry, ...(appState.terminalDealsFeed || [])].slice(0, 30);
  if (appState.currentPage === "terminal") renderApp();
});

socket.on("ipo:update", data => {
  if (!window.currentPlayer) return;
  appState.ipo = data;
  if (appState.currentPage === "ma") renderApp();
});

socket.on("cibBonus:update", data => {
  if (!window.currentPlayer) return;
  appState.cibBonusPool = data;
  if (appState.currentPage === "ma") renderApp();
});

socket.on("boardOfDirectors:update", data => {
  if (!window.currentPlayer) return;
  appState.cibLeadership = data;
  if (appState.currentPage === "ma") renderApp();
});

socket.on("board:youWereAppointed", data => {
  notify("🏛 Le Conseil d'Administration vous nomme " + data.role + " !");
});

socket.on("board:youWereFired", data => {
  notify("🏛 Le Conseil d'Administration vous démet de votre poste de " + data.role + ".");
});

socket.on("pitchbook:update", data => {
  if (!window.currentPlayer) return;
  appState.pitchbookCompetitions = data;
  if (appState.currentPage === "ma") renderApp();
});

socket.on("pitchbook:bidRejected", data => {
  const errEl = document.getElementById("pitchbook-error");
  if (errEl) errEl.textContent = data.reason;
});

socket.on("repoStatus:update", data => {
  if (!window.currentPlayer) return;
  appState.repoStatus = data;
  renderApp();
});

socket.on("marginCall:update", data => {
  if (!window.currentPlayer) return;
  appState.marginCall = data;
  renderApp();
});

socket.on("riskControl:update", () => {
  if (!window.currentPlayer) return;
  if (["compliance", "markets"].includes(appState.currentPage)) renderApp();
});

socket.on("compliance:killSwitched", data => {
  notify("🛑 Kill Switch — le Risk Manager vous interdit de trader pendant " + Math.round((data.untilTs - Date.now()) / 60000) + " min.");
});

socket.on("compliance:killSwitchLifted", () => {
  notify("✅ Kill Switch levé — vous pouvez de nouveau trader.");
});

socket.on("structuredProducts:update", data => {
  if (!window.currentPlayer) return;
  appState.hedgingRequests = data.hedgingRequests;
  appState.structuredProducts = data.structuredProducts;
  appState.pendingHedges = data.pendingHedges;
  if (appState.currentPage === "markets") renderApp();
});

socket.on("session:trophies", data => {
  if (!window.currentPlayer) return;
  appState.sessionEnded = true;
  appState.trophies = data;
  renderTrophyOverlay(data);
});

socket.on("maBreakthrough:announce", data => {
  if (!window.currentPlayer) return;
  showMaBreakthrough(data);
});

socket.on("rfq:update", data => {
  if (!window.currentPlayer) return;
  appState.rfqRequests = data;
  if (appState.currentPage === "markets") renderApp();
});

socket.on("cib:distributeBonus:rejected", data => {
  const errEl = document.getElementById("cib-bonus-error");
  if (errEl) errEl.textContent = data.reason;
});

socket.on("creditRatings:update", data => {
  if (!window.currentPlayer) return;
  appState.creditRatings = data;
  if (appState.currentPage === "overview") renderApp();
});

socket.on("mercato:update", data => {
  if (!window.currentPlayer) return;
  appState.rivalTalent = data.rivalTalent;
  appState.mercatoOffers = data.mercatoOffers;
  appState.hr = data.hr;
  if (appState.currentPage === "hr" || appState.currentPage === "strategy") renderApp();
});

socket.on("mercato:offerRejected", data => {
  const errEl = document.getElementById("mercato-error");
  if (errEl) errEl.textContent = data.reason;
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

socket.on("hr:hire:rejected", data => {
  const errorEl = document.getElementById("hr-hire-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("hr:distributeBonus:rejected", data => {
  const errorEl = document.getElementById("hr-bonus-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("finance:allocateBudget:rejected", data => {
  const errorEl = document.getElementById("fin-budget-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("finance:capitalAction:rejected", data => {
  const errorEl = document.getElementById("fin-capital-error");
  if (errorEl) errorEl.textContent = data.reason;
});

socket.on("finance:update", kpis => {
  if (!window.currentPlayer) return;
  appState.financeKPIs = kpis;
  if (appState.currentPage === "finance") renderApp();
});

socket.on("markets:update", markets => {
  if (!window.currentPlayer) return;
  appState.markets = markets;
  if (appState.currentPage === "markets") renderApp();
});

socket.on("globalTicker:update", data => {
  if (!window.currentPlayer) return;
  appState.publicTicker = data;
  renderGlobalTicker();
});

socket.on("globalBank:update", data => {
  if (!window.currentPlayer) return;
  appState.globalBank = data;
  if (appState.currentPage === "global") renderApp();
});

socket.on("rivalAggression:poachingUpdate", data => {
  if (!window.currentPlayer) return;
  appState.poachingAttempts = data;
  if (appState.currentPage === "hr") renderApp();
});

socket.on("aiAgents:update", data => {
  if (!window.currentPlayer) return;
  appState.aiAgents = data;
  if (appState.currentPage === "hr") renderApp();
});

socket.on("centralBank:update", data => {
  if (!window.currentPlayer) return;
  appState.centralBank = data;
  if (appState.currentPage === "markets") renderApp();
});

socket.on("stressTest:update", data => {
  if (!window.currentPlayer) return;
  appState.stressTest = data;
  if (appState.currentPage === "global") renderApp();
});

socket.on("privateBanking:update", data => {
  if (!window.currentPlayer) return;
  appState.privateBanking = data;
  if (appState.currentPage === "privateBanking") renderApp();
});

socket.on("algoTrading:update", data => {
  if (!window.currentPlayer) return;
  appState.algoBots = data.bots;
  appState.algoInfrastructure = data.infrastructure;
  if (appState.currentPage === "markets") renderApp();
});

socket.on("algo:investLatency:rejected", data => {
  const errEl = document.getElementById("algo-latency-error");
  if (errEl) errEl.textContent = data.reason;
});

socket.on("hostileTakeover:update", data => {
  if (!window.currentPlayer) return;
  appState.hostileTakeovers = data;
  if (appState.currentPage === "ma") renderApp();
});

socket.on("ma:deployDefense:rejected", data => {
  const errEl = document.getElementById("ht-defense-error");
  if (errEl) errEl.textContent = data.reason;
});

socket.on("markets:buy:rejected", data => {
  // Shared rejection event: markets:buy and the insider-trading panel both use it
  // (both are capital-insufficiency checks) but render into different DOM nodes.
  const errorEl = document.getElementById("mk-buy-error");
  if (errorEl) errorEl.textContent = data.reason;
  const insiderErrorEl = document.getElementById("insider-error");
  if (insiderErrorEl) insiderErrorEl.textContent = data.reason;
});

socket.on("markets:darkPoolOrder:rejected", data => {
  const errEl = document.getElementById("dp-error");
  if (errEl) errEl.textContent = data.reason;
});

socket.on("markets:insiderResult", data => {
  notify(data.caught
    ? "🚨 Compliance vous a pris en flagrant délit d'initié — amende de " + data.fine + " M$."
    : "🤫 Information exploitée sans être repéré — gain de " + data.gain + " M$.");
});

socket.on("game:directiveChanged", directive => {
  if (!window.currentPlayer) return;
  appState.directive = directive;
  renderApp();
});

socket.on("liveEvents:update", liveEvents => {
  if (!window.currentPlayer) return;
  appState.liveEvents = liveEvents;
  if (appState.currentPage === "overview") renderApp();
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

socket.on("event:triggered", ev => {
  if (!window.currentPlayer) return;
  notify((EVENT_TYPE_ICONS[ev.type] || "⚠️") + " " + ev.label);
  startTitleFlash("🚨 " + ev.label);
  renderApp();
});

socket.on("event:resolved", () => {
  if (!window.currentPlayer) return;
  if (!(appState.activeEvents || []).length) stopTitleFlash();
  renderApp();
});

socket.on("event:expired", () => {
  if (!window.currentPlayer) return;
  if (!(appState.activeEvents || []).length) stopTitleFlash();
  renderApp();
});

socket.on("tasks:update", data => {
  if (!window.currentPlayer) return;
  const previousIds = new Set(appState.taskQueue.filter(t => t.page === data.page).map(t => t.id));
  const hasNewTask = data.tasks.some(t => !previousIds.has(t.id));
  appState.taskQueue = appState.taskQueue.filter(t => t.page !== data.page).concat(data.tasks);
  if (appState.currentPage === data.page) {
    renderApp();
  } else if (hasNewTask) {
    notify("⚡ Nouvelle tâche sur " + (TASK_SUMMARY_LABELS[data.page] || data.page));
  }
});

socket.on("tasks:summary", summary => {
  if (!window.currentPlayer) return;
  appState.tasksSummary = summary;
  if (appState.currentPage === "overview") renderApp();
});

socket.on("game:bankrupt", () => {
  if (!window.currentPlayer) return;
  appState.bankrupt = true;
  renderApp();
});

socket.on("strategy:update", data => {
  if (!window.currentPlayer) return;
  if (data.quarterDecisions != null) appState.quarterDecisions = data.quarterDecisions;
  if (data.currentQuarter != null) appState.currentQuarter = data.currentQuarter;
  if (data.quarterDeadline != null) appState.quarterDeadline = data.quarterDeadline;
  renderApp();
});

socket.on("strategy:quarterResolved", report => {
  if (!window.currentPlayer) return;
  appState.quarterHistory = [report, ...(appState.quarterHistory || [])].slice(0, 12);
  if (appState.currentPage === "strategy") renderApp();
});

socket.on("game:pauseState", data => {
  if (!window.currentPlayer) return;
  appState.paused = data.paused;
  renderApp();
});

socket.on("game:difficultyChanged", data => {
  if (!window.currentPlayer) return;
  appState.difficulty = data.difficulty;
  if (appState.currentPage === "strategy") renderApp();
});

socket.on("game:victory", () => {
  if (!window.currentPlayer) return;
  appState.victory = true;
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
