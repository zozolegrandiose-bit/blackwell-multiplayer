// HR-4 Performance & Formation -- stress accrues on the desk that actually closed
// a deal (server/handlers/dealWorkflow.js calls applyStress on the 3 workflow
// participants after every successful execution); a sabbatical is the only way
// down, at the cost of the collaborator being unavailable for a while, with a
// real payoff (skillRating) once it ends.
const { pushActivity, buildPublicRoster } = require("./gameState");

const STRESS_PER_DEAL = 15;
const SABBATICAL_MIN_MS = 2 * 60 * 1000;
const SABBATICAL_MAX_MS = 5 * 60 * 1000;
const SABBATICAL_SKILL_GAIN = 10;
const SWEEP_MIN_MS = 5 * 1000;
const SWEEP_MAX_MS = 8 * 1000;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function applyStress(io, gameState, player, delta) {
  if (!player) return;
  player.stress = Math.max(0, Math.min(100, Math.round((player.stress || 0) + delta)));
  io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
}

function registerTalentManagementHandlers(io, socket, gameState) {
  socket.on("hr:sendOnSabbatical", payload => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    const target = gameState.players.find(p => p.id === payload.playerId);
    if (!actor || !target || target.onSabbatical) return;

    const duration = Math.max(SABBATICAL_MIN_MS, Math.min(SABBATICAL_MAX_MS, Number(payload.durationMs) || SABBATICAL_MIN_MS));
    target.onSabbatical = true;
    target.sabbaticalUntil = Date.now() + duration;
    target.stress = Math.round((target.stress || 0) / 2);

    io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
    pushActivity(gameState, { actorPlayerId: actor.id, page: "hr", text: actor.fullName + " envoie " + target.fullName + " en sabbatique / formation (" + Math.round(duration / 60000) + " min)." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    const targetSocket = io.sockets.sockets.get(target.socketId);
    if (targetSocket) targetSocket.emit("hr:sabbaticalStarted", { untilTs: target.sabbaticalUntil });
  });
}

// Called from settleMarketDay() -- ends any sabbatical whose duration has passed:
// stress fully reset, skillRating bumped (the real "monter ses stats de
// compétences" payoff), player notified directly.
function sweepSabbaticals(io, gameState) {
  const now = Date.now();
  let changed = false;
  gameState.players.forEach(player => {
    if (!player.onSabbatical || now < player.sabbaticalUntil) return;
    player.onSabbatical = false;
    player.sabbaticalUntil = null;
    player.stress = 0;
    player.skillRating = Math.min(100, (player.skillRating || 50) + SABBATICAL_SKILL_GAIN);
    changed = true;
    pushActivity(gameState, { actorPlayerId: null, page: "hr", text: player.fullName + " revient de sabbatique / formation — stress réinitialisé, compétences renforcées (" + player.skillRating + ")." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    const targetSocket = io.sockets.sockets.get(player.socketId);
    if (targetSocket) targetSocket.emit("hr:sabbaticalEnded", { newSkillRating: player.skillRating });
  });
  if (changed) io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

// Independent self-rescheduling loop (same convention as every other timed system
// in this codebase) -- sabbaticals last 2-5 minutes, far shorter than the 15-minute
// market day cycle, so this cannot piggyback on settleMarketDay() the way payroll/
// resignations do.
function startTalentManagementLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepSabbaticals(io, gameState);
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Gestion des talents activée (stress par deal, sabbatique/formation).");
}

module.exports = { registerTalentManagementHandlers, startTalentManagementLoop, sweepSabbaticals, applyStress, STRESS_PER_DEAL, SABBATICAL_MIN_MS, SABBATICAL_MAX_MS, SABBATICAL_SKILL_GAIN };
