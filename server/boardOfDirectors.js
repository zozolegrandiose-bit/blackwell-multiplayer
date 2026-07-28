// Board of Directors & Activist Shareholders -- distinct from the generic
// player.isHeadOfCIB flag (a page-access permission any qualifying Director+ in
// cluster A holds): gameState.cibLeadership is a single formal office the AI
// board actually appoints, tracks, and can vacate. Evaluated at every market day
// settlement (the established "end of cycle" hook already used by the Rating
// Agency/CIB bonus accrual/payroll).
const { pushActivity, postTeamChat } = require("./gameState");
const { isHeadOfCIB } = require("./cibBonus");

const CONSECUTIVE_BAD_CYCLES_TO_FIRE = 3;

function findEligibleCandidate(gameState, excludePlayerId) {
  return gameState.players.find(p => p.id !== excludePlayerId && isHeadOfCIB(p)) || null;
}

function appointHeadOfCIB(io, gameState, candidate) {
  gameState.cibLeadership.holderPlayerId = candidate.id;
  gameState.cibLeadership.holderName = candidate.fullName;
  gameState.cibLeadership.consecutiveBadCycles = 0;
  gameState.cibLeadership.appointedAt = Date.now();

  pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "🏛 Le Conseil d'Administration nomme " + candidate.fullName + " Head of CIB." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("game").emit("boardOfDirectors:update", gameState.cibLeadership);
  const targetSocket = io.sockets.sockets.get(candidate.socketId);
  if (targetSocket) targetSocket.emit("board:youWereAppointed", { role: "Head of CIB" });
}

// Called from settleMarketDay() -- one evaluation per period, matching the
// Rating Agency/CIB bonus accrual convention.
function evaluateCibLeadership(io, gameState, dayNetIncome) {
  const leadership = gameState.cibLeadership;
  let holder = leadership.holderPlayerId ? gameState.players.find(p => p.id === leadership.holderPlayerId) : null;

  // Holder left, got reassigned out of cluster A, or was demoted below Director --
  // the office is vacated without a formal firing (no fault, just no longer eligible).
  if (leadership.holderPlayerId && (!holder || !isHeadOfCIB(holder))) {
    leadership.holderPlayerId = null;
    leadership.holderName = null;
    leadership.consecutiveBadCycles = 0;
    holder = null;
  }

  if (!holder) {
    const candidate = findEligibleCandidate(gameState, null);
    if (candidate) appointHeadOfCIB(io, gameState, candidate);
    return;
  }

  leadership.consecutiveBadCycles = dayNetIncome > 0 ? 0 : leadership.consecutiveBadCycles + 1;

  if (leadership.consecutiveBadCycles >= CONSECUTIVE_BAD_CYCLES_TO_FIRE) {
    const firedName = holder.fullName;
    pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "🏛 Le Conseil d'Administration vote le renvoi de " + firedName + " (Head of CIB) après " + leadership.consecutiveBadCycles + " périodes de sous-performance." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Conseil d'Administration", text: "🏛 Les actionnaires activistes ont eu gain de cause : " + firedName + " est démis(e) de son poste de Head of CIB.", tone: "alert" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    const firedSocket = io.sockets.sockets.get(holder.socketId);
    if (firedSocket) firedSocket.emit("board:youWereFired", { role: "Head of CIB" });

    leadership.holderPlayerId = null;
    leadership.holderName = null;
    leadership.consecutiveBadCycles = 0;
    io.to("game").emit("boardOfDirectors:update", leadership);

    const replacement = findEligibleCandidate(gameState, holder.id);
    if (replacement) appointHeadOfCIB(io, gameState, replacement);
    return;
  }

  io.to("game").emit("boardOfDirectors:update", leadership);
}

module.exports = { evaluateCibLeadership, appointHeadOfCIB, findEligibleCandidate, CONSECUTIVE_BAD_CYCLES_TO_FIRE };
