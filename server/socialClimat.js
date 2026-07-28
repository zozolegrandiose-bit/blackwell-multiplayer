// HR-5 Climat Social & Démissions -- watches every connected player's stress and
// satisfaction and fires one of three real consequences. Résignation sèche
// (satisfaction critically low) is handled by server/satisfaction.js's existing
// sweepResignations -- this file adds the two lighter tiers above it: a raise
// request (informational, resolved by hr:grantRaise) and burn-out (a forced,
// temporary incapacitation, structurally the negative mirror of a sabbatical).
const { pushActivity, postTeamChat, buildPublicRoster } = require("./gameState");
const { adjustSatisfaction } = require("./satisfaction");

const RAISE_REQUEST_SATISFACTION_THRESHOLD = 30;
const BURNOUT_STRESS_THRESHOLD = 85;
const BURNOUT_DURATION_MS = 3 * 60 * 1000;
const BURNOUT_STRESS_RELIEF = 40; // stress drops to this level, not zero -- burnout is a partial forced reset, not a cure
const SWEEP_MIN_MS = 5 * 1000;
const SWEEP_MAX_MS = 8 * 1000;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function sweepSocialClimate(io, gameState) {
  let rosterChanged = false;
  gameState.players.forEach(player => {
    const satisfaction = player.satisfaction == null ? 70 : player.satisfaction;
    const stress = player.stress || 0;

    if (!player.onSickLeave && stress >= BURNOUT_STRESS_THRESHOLD) {
      player.onSickLeave = true;
      player.sickLeaveUntil = Date.now() + BURNOUT_DURATION_MS;
      player.stress = BURNOUT_STRESS_RELIEF;
      rosterChanged = true;
      pushActivity(gameState, { actorPlayerId: null, page: "hr", text: "🤒 " + player.fullName + " est en burn-out — arrêt de travail forcé de " + Math.round(BURNOUT_DURATION_MS / 60000) + " min (stress critique)." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      postTeamChat(gameState, { authorName: "IA — Ressources Humaines", text: "🤒 " + player.fullName + " part en arrêt pour burn-out — la charge de travail doit être répartie autrement.", tone: "alert" });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
      const targetSocket = io.sockets.sockets.get(player.socketId);
      if (targetSocket) targetSocket.emit("hr:burnout", { untilTs: player.sickLeaveUntil });
    } else if (player.onSickLeave && Date.now() >= player.sickLeaveUntil) {
      player.onSickLeave = false;
      player.sickLeaveUntil = null;
      rosterChanged = true;
      pushActivity(gameState, { actorPlayerId: null, page: "hr", text: player.fullName + " reprend le travail après son arrêt." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      const targetSocket = io.sockets.sockets.get(player.socketId);
      if (targetSocket) targetSocket.emit("hr:backFromLeave", {});
    }

    if (!player.raiseRequested && satisfaction < RAISE_REQUEST_SATISFACTION_THRESHOLD) {
      player.raiseRequested = true;
      rosterChanged = true;
      pushActivity(gameState, { actorPlayerId: null, page: "hr", text: "💬 " + player.fullName + " a fait une demande d'augmentation urgente (satisfaction basse)." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      io.to("access:hr").emit("hr:raiseRequested", { playerId: player.id, fullName: player.fullName });
    } else if (player.raiseRequested && satisfaction >= RAISE_REQUEST_SATISFACTION_THRESHOLD) {
      player.raiseRequested = false; // satisfaction recovered on its own (bonus, promotion, etc.) -- withdraw the request
      rosterChanged = true;
    }
  });
  if (rosterChanged) io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
}

function registerSocialClimatHandlers(io, socket, gameState) {
  socket.on("hr:grantRaise", payload => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    const target = gameState.players.find(p => p.id === payload.playerId);
    if (!actor || !target) return;
    const raise = Math.max(0.1, Math.min(20, Number(payload.raiseAmount) || 2));

    target.baseSalary = round1(target.baseSalary + raise);
    target.raiseRequested = false;
    adjustSatisfaction(io, gameState, target, 20);

    pushActivity(gameState, { actorPlayerId: actor.id, page: "hr", text: actor.fullName + " a accordé une augmentation de " + raise + " M$/an à " + target.fullName + "." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    const targetSocket = io.sockets.sockets.get(target.socketId);
    if (targetSocket) targetSocket.emit("hr:raiseGranted", { newSalary: target.baseSalary });
  });
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startSocialClimatLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepSocialClimate(io, gameState);
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Climat social activé (demandes d'augmentation, burn-out).");
}

module.exports = { registerSocialClimatHandlers, startSocialClimatLoop, sweepSocialClimate, RAISE_REQUEST_SATISFACTION_THRESHOLD, BURNOUT_STRESS_THRESHOLD, BURNOUT_DURATION_MS };
