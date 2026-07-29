const { GRADES, DEPARTMENTS } = require("../seedData");
const { claimSlot, releaseSlotBySocketId, getTakenSlots } = require("../rooms");
const { pushActivity, buildPublicRoster } = require("../gameState");
const { hrRosterView } = require("./hr");
const { buildDecisionsView } = require("../strategy");
const { summarizeTasks } = require("../tasks");
const { publicInstrumentTicker } = require("./markets");

function publicRoster(gameState) {
  return buildPublicRoster(gameState);
}

// Shared by join:claim and game:requestReset (server/handlers/game.js) — the shape
// a player's client expects, filtered to only the state slices their access allows.
function buildSnapshot(gameState, player) {
  const ownMail = gameState.mail.filter(m => m.fromPlayerId === player.id || m.toPlayerId === player.id);
  const ownDMs = gameState.terminalDMs.filter(m => m.fromPlayerId === player.id || m.toPlayerId === player.id);
  const snapshot = {
    players: publicRoster(gameState),
    activityLog: gameState.activityLog,
    financeKPIs: gameState.financeKPIs,
    mail: ownMail,
    playerScores: gameState.playerScores,
    bankHealth: gameState.bankHealth,
    bankrupt: gameState.bankrupt,
    activeEvents: gameState.activeEvents,
    campaignGoal: gameState.campaignGoal,
    victory: gameState.victory,
    currentQuarter: gameState.currentQuarter,
    quarterPhase: gameState.quarterPhase,
    quarterDeadline: gameState.quarterDeadline,
    quarterDecisions: buildDecisionsView(gameState, player.cluster),
    tasksSummary: summarizeTasks(gameState),
    taskQueue: gameState.taskQueue.filter(t => player.access.includes(t.page)),
    quarterHistory: gameState.quarterHistory,
    hallOfFame: gameState.hallOfFame,
    paused: gameState.paused,
    difficulty: gameState.difficulty,
    directive: gameState.directive,
    liveEvents: gameState.liveEvents,
    executedWorkflows: gameState.executedWorkflows,
    teamChat: gameState.teamChat,
    leagueTable: gameState.leagueTable,
    marketDay: { dayNumber: gameState.marketDay.dayNumber, deadline: gameState.marketDay.deadline },
    warRoom: gameState.warRoom,
    repoStatus: gameState.repoStatus,
    marginCall: gameState.marginCall,
    sessionEnded: gameState.sessionEnded,
    trophies: gameState.trophies,
    creditRatings: gameState.creditRatings,
    ipo: gameState.ipo,
    terminalDMs: ownDMs,
    terminalDealsFeed: gameState.terminalDealsFeed,
    globalBank: gameState.globalBank,
    publicTicker: publicInstrumentTicker(gameState),
    aiAgents: gameState.aiAgents,
    poachingAttempts: gameState.poachingAttempts
  };
  // Compliance (Risk Manager) and Markets (Desk Trading) both surface workflow
  // panels derived from maDeals even though neither has the M&A page itself —
  // simpler to share the same read-only array than maintain three filtered views.
  if (player.access.includes("ma") || player.access.includes("compliance") || player.access.includes("markets")) {
    snapshot.maDeals = gameState.maDeals;
  }
  if (player.access.includes("ma")) {
    snapshot.cibBonusPool = gameState.cibBonusPool;
    snapshot.pitchbookCompetitions = gameState.pitchbookCompetitions;
  }
  snapshot.cibLeadership = gameState.cibLeadership;
  if (player.access.includes("clients")) snapshot.clients = gameState.clients;
  if (player.access.includes("compliance")) {
    snapshot.complianceItems = gameState.complianceItems;
    snapshot.markets = gameState.markets; // needed for the VaR control panel
  }
  if (player.access.includes("hr")) {
    snapshot.hr = gameState.hr;
    snapshot.hrRoster = hrRosterView(gameState);
  }
  if (player.access.includes("hr") || player.access.includes("strategy")) {
    snapshot.rivalTalent = gameState.rivalTalent;
    snapshot.mercatoOffers = gameState.mercatoOffers;
  }
  if (player.access.includes("agenda")) snapshot.agenda = gameState.agenda;
  if (player.access.includes("documents")) snapshot.documents = gameState.documents;
  if (player.access.includes("expenses")) snapshot.expenseReports = gameState.expenseReports;
  if (player.access.includes("markets")) {
    snapshot.markets = gameState.markets;
    snapshot.hedgingRequests = gameState.hedgingRequests;
    snapshot.structuredProducts = gameState.structuredProducts;
    snapshot.rfqRequests = gameState.rfqRequests;
    snapshot.pendingHedges = gameState.pendingHedges;
  }
  return snapshot;
}

function registerJoinHandlers(io, socket, gameState) {
  socket.on("join:request", () => {
    socket.emit("join:roster", {
      grades: GRADES,
      departments: DEPARTMENTS,
      takenSlots: getTakenSlots(gameState),
      players: publicRoster(gameState)
    });
  });

  socket.on("join:claim", payload => {
    const result = claimSlot(gameState, { socketId: socket.id, ...payload });
    if (!result.ok) {
      socket.emit("join:claim:rejected", {
        reason: result.reason,
        takenSlots: getTakenSlots(gameState)
      });
      return;
    }

    const player = result.player;
    socket.data.playerId = player.id;
    socket.join("game");
    player.access.forEach(page => socket.join("access:" + page));

    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "overview",
      text: player.fullName + " a rejoint la partie en tant que " + player.grade + ", " + player.dept + "."
    });

    socket.emit("join:success", { player, snapshot: buildSnapshot(gameState, player) });
    io.to("game").emit("roster:update", { players: publicRoster(gameState) });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  socket.on("disconnect", () => {
    const removed = releaseSlotBySocketId(gameState, socket.id);
    if (!removed) return;
    pushActivity(gameState, {
      actorPlayerId: removed.id,
      page: "overview",
      text: removed.fullName + " a quitté la partie."
    });
    io.to("game").emit("roster:update", { players: publicRoster(gameState) });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
}

module.exports = { registerJoinHandlers, publicRoster, buildSnapshot };
