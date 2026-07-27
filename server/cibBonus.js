// CIB Bonus Pool -- distinct from HR's company-wide bonus pool (server/handlers/hr.js):
// this envelope is specific to cluster A ("Corporate & Investment Banking" --
// M&A, ECM, DCM, Leveraged Finance, etc.), accrues automatically at each market
// day settlement (a real "end of period" pool sized off that period's net income,
// not a live recomputation), and only a Head of CIB -- Director grade or above,
// inside cluster A -- can distribute it among their own team. A dedicated "ai-team"
// allocation slot represents whichever CIB desks are currently AI-covered (nobody
// connected to that specific slot) -- logged for real, no player to actually award.
const { pushActivity } = require("./gameState");
const { awardCustomPoints } = require("./scoring");
const { adjustSatisfaction } = require("./satisfaction");
const { GRADES } = require("./seedData");

const CIB_BONUS_POOL_PCT = 0.06;
const DIRECTOR_INDEX = GRADES.indexOf("Director");
const AI_TEAM_KEY = "ai-team";

function round1(n) {
  return Math.round(n * 10) / 10;
}

function isHeadOfCIB(player) {
  return !!player && player.cluster === "A" && GRADES.indexOf(player.grade) >= DIRECTOR_INDEX;
}

// Called from settleMarketDay() -- sizes the new envelope off that period's actual
// net income, same convention as the day-wide bonus pool already computed there.
function accrueCibBonusPool(gameState, dayNetIncome) {
  if (dayNetIncome <= 0) return;
  gameState.cibBonusPool.available = round1(gameState.cibBonusPool.available + dayNetIncome * CIB_BONUS_POOL_PCT);
  gameState.cibBonusPool.periodNumber = gameState.marketDay.dayNumber;
}

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function registerCibBonusHandlers(io, socket, gameState) {
  socket.on("cib:distributeBonus", payload => {
    if (!requireAccess(socket, "ma")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    if (!isHeadOfCIB(actor)) return;

    const allocations = payload.allocations || {};
    const pool = gameState.cibBonusPool.available;

    let total = 0;
    const playerEntries = [];
    let aiAmount = 0;
    for (const key of Object.keys(allocations)) {
      const amount = Number(allocations[key]);
      if (Number.isNaN(amount) || amount <= 0) continue;
      if (key === AI_TEAM_KEY) {
        aiAmount = round1(amount);
        total += amount;
        continue;
      }
      const target = gameState.players.find(p => p.id === key && p.cluster === "A");
      if (!target) continue;
      playerEntries.push({ target, amount: round1(amount) });
      total += amount;
    }

    if (round1(total) > pool) {
      socket.emit("cib:distributeBonus:rejected", { reason: "Le total dépasse l'enveloppe CIB disponible (" + pool + " M$)." });
      return;
    }
    if (!playerEntries.length && !aiAmount) {
      socket.emit("cib:distributeBonus:rejected", { reason: "Aucune allocation valide." });
      return;
    }

    playerEntries.forEach(({ target, amount }) => {
      awardCustomPoints(io, gameState, target, Math.round(amount * 10), amount);
      adjustSatisfaction(io, gameState, target, Math.min(20, Math.round(amount)));
    });

    gameState.cibBonusPool.available = round1(pool - total);
    gameState.cibBonusPool.distributedLog.unshift({
      byPlayerId: actor.id,
      byName: actor.fullName,
      total: round1(total),
      recipients: playerEntries.map(e => e.target.fullName).concat(aiAmount ? ["Équipe IA — CIB"] : []),
      ts: Date.now()
    });
    if (gameState.cibBonusPool.distributedLog.length > 20) gameState.cibBonusPool.distributedLog.length = 20;

    io.to("access:ma").emit("cibBonus:update", gameState.cibBonusPool);
    pushActivity(gameState, {
      actorPlayerId: actor.id,
      page: "ma",
      text: actor.fullName + " (Head of CIB) a réparti " + round1(total) + " M$ de bonus au sein de l'équipe Dealmaking."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
}

module.exports = { registerCibBonusHandlers, accrueCibBonusPool, isHeadOfCIB, CIB_BONUS_POOL_PCT, AI_TEAM_KEY };
