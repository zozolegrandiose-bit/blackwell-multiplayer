// HR-6 Discipline & Compliance -- once an ethics/compliance alert names a target
// employee (compliance item's targetPlayerId, set by whichever handler raised it --
// e.g. the insider-trading catch in server/handlers/markets.js), the DRH can act
// directly on that person: a temporary suspension (same structural shape as a
// sabbatical/sick leave, but punitive), a blâme (a logged reprimand with no
// duration), or termination (a hard removal, harsher framing than a voluntary
// resignation but the same underlying "free the slot" mechanic).
const { pushActivity, postTeamChat, buildPublicRoster } = require("./gameState");
const { adjustSatisfaction } = require("./satisfaction");

const SUSPENSION_DURATION_MS = 3 * 60 * 1000;
const BLAME_SATISFACTION_PENALTY = 10;
const SUSPENSION_SATISFACTION_PENALTY = 20;

function requireAccess(socket, page) {
  return socket.rooms.has("access:hr") || socket.rooms.has("access:compliance");
}

function registerComplianceHRHandlers(io, socket, gameState) {
  socket.on("hr:disciplineEmployee", payload => {
    if (!requireAccess(socket)) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    const target = gameState.players.find(p => p.id === payload.playerId);
    if (!actor || !target) return;
    const action = payload.action;
    if (!["suspend", "blame", "terminate"].includes(action)) return;

    if (action === "blame") {
      adjustSatisfaction(io, gameState, target, -BLAME_SATISFACTION_PENALTY);
      pushActivity(gameState, { actorPlayerId: actor.id, page: "compliance", text: actor.fullName + " a donné un blâme à " + target.fullName + " suite à une alerte de conformité." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      const targetSocket = io.sockets.sockets.get(target.socketId);
      if (targetSocket) targetSocket.emit("hr:disciplined", { action: "blame" });
      return;
    }

    if (action === "suspend") {
      target.onSuspension = true;
      target.suspensionUntil = Date.now() + SUSPENSION_DURATION_MS;
      adjustSatisfaction(io, gameState, target, -SUSPENSION_SATISFACTION_PENALTY);
      pushActivity(gameState, { actorPlayerId: actor.id, page: "compliance", text: actor.fullName + " a suspendu temporairement " + target.fullName + " (" + Math.round(SUSPENSION_DURATION_MS / 60000) + " min) suite à une alerte de conformité." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
      const targetSocket = io.sockets.sockets.get(target.socketId);
      if (targetSocket) targetSocket.emit("hr:disciplined", { action: "suspend", untilTs: target.suspensionUntil });
      return;
    }

    // terminate
    const idx = gameState.players.findIndex(p => p.id === target.id);
    if (idx === -1) return;
    gameState.players.splice(idx, 1);
    pushActivity(gameState, { actorPlayerId: actor.id, page: "compliance", text: "⚖️ " + actor.fullName + " a licencié " + target.fullName + " pour faute grave — le poste " + target.grade + ", " + target.dept + " est de nouveau vacant." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Ressources Humaines", text: "⚖️ " + target.fullName + " a été licencié(e) pour faute grave.", tone: "alert" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
    const targetSocket = io.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.data.playerId = null;
      targetSocket.emit("game:youWereTerminated", { reason: "Licencié(e) pour faute grave suite à une alerte de conformité." });
    }
  });
}

function sweepSuspensions(io, gameState) {
  let changed = false;
  gameState.players.forEach(player => {
    if (!player.onSuspension || Date.now() < player.suspensionUntil) return;
    player.onSuspension = false;
    player.suspensionUntil = null;
    changed = true;
    pushActivity(gameState, { actorPlayerId: null, page: "compliance", text: player.fullName + " reprend son poste après sa suspension." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    const targetSocket = io.sockets.sockets.get(player.socketId);
    if (targetSocket) targetSocket.emit("hr:backFromLeave", {});
  });
  if (changed) io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
}

const SWEEP_MIN_MS = 5 * 1000;
const SWEEP_MAX_MS = 8 * 1000;

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startComplianceHRLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepSuspensions(io, gameState);
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Discipline & Compliance RH activée (suspensions temporaires).");
}

module.exports = { registerComplianceHRHandlers, startComplianceHRLoop, sweepSuspensions, SUSPENSION_DURATION_MS, BLAME_SATISFACTION_PENALTY, SUSPENSION_SATISFACTION_PENALTY };
