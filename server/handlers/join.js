const { GRADES, DEPARTMENTS } = require("../seedData");
const { claimSlot, releaseSlotBySocketId, getTakenSlots } = require("../rooms");
const { pushActivity } = require("../gameState");
const { hrRosterView } = require("./hr");
const { buildDecisionsView } = require("../strategy");
const { summarizeTasks } = require("../tasks");

function publicRoster(gameState) {
  return gameState.players.map(p => ({
    id: p.id,
    fullName: p.fullName,
    grade: p.grade,
    dept: p.dept,
    cluster: p.cluster
  }));
}

// Shared by join:claim and game:requestReset (server/handlers/game.js) — the shape
// a player's client expects, filtered to only the state slices their access allows.
function buildSnapshot(gameState, player) {
  const ownMail = gameState.mail.filter(m => m.fromPlayerId === player.id || m.toPlayerId === player.id);
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
    difficulty: gameState.difficulty
  };
  if (player.access.includes("ma")) snapshot.maDeals = gameState.maDeals;
  if (player.access.includes("clients")) snapshot.clients = gameState.clients;
  if (player.access.includes("compliance")) snapshot.complianceItems = gameState.complianceItems;
  if (player.access.includes("hr")) {
    snapshot.hr = gameState.hr;
    snapshot.hrRoster = hrRosterView(gameState);
  }
  if (player.access.includes("agenda")) snapshot.agenda = gameState.agenda;
  if (player.access.includes("documents")) snapshot.documents = gameState.documents;
  if (player.access.includes("expenses")) snapshot.expenseReports = gameState.expenseReports;
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
