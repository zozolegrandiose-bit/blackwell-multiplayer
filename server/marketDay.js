// "Journée de marché" — a global day timer wrapping the whole game (distinct from
// the much shorter 90s quarterly strategy cycle): at the end of each 15-minute real
// day, the day's P&L is settled and a bonus pool is paid out to whoever actually
// contributed to it, then a fresh day begins immediately (no player action needed).
const { pushActivity, postTeamChat } = require("./gameState");
const { awardCustomPoints } = require("./scoring");
const { getDifficultyPreset } = require("./difficulty");
const { runRatingAgency } = require("./ratingAgency");
const { accrueCibBonusPool } = require("./cibBonus");
const { sweepResignations } = require("./satisfaction");
const { runPayrollDeduction } = require("./handlers/hr");
const { evaluateCibLeadership } = require("./boardOfDirectors");

const DAY_LENGTH_MS = 15 * 60 * 1000;
const SWEEP_MIN_MS = 10 * 1000;
const SWEEP_MAX_MS = 15 * 1000;
const DAY_BONUS_POOL_PCT = 0.10;

function round1(n) {
  return Math.round(n * 10) / 10;
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function snapshotScores(gameState) {
  const snapshot = {};
  Object.keys(gameState.playerScores).forEach(key => {
    snapshot[key] = gameState.playerScores[key].score;
  });
  return snapshot;
}

function snapshotLeagueTable(gameState) {
  const snapshot = {};
  Object.keys(gameState.leagueTable).forEach(name => {
    snapshot[name] = gameState.leagueTable[name].pnl;
  });
  return snapshot;
}

// Pure-ish core (only side effects are on gameState/io), unit-testable directly —
// same convention as server/strategy.js's resolveQuarter().
function settleMarketDay(io, gameState) {
  const day = gameState.marketDay;
  const kpis = gameState.financeKPIs;
  const dayNetIncome = round1(kpis.netIncome - day.dayStartNetIncome);
  const bonusPool = dayNetIncome > 0 ? round1(dayNetIncome * DAY_BONUS_POOL_PCT) : 0;

  const gainers = Object.keys(gameState.playerScores)
    .map(key => ({ key, delta: gameState.playerScores[key].score - (day.dayStartScores[key] || 0) }))
    .filter(g => g.delta > 0);
  const totalDelta = gainers.reduce((sum, g) => sum + g.delta, 0);

  const payouts = [];
  if (bonusPool > 0 && totalDelta > 0) {
    gainers.forEach(g => {
      const entry = gameState.playerScores[g.key];
      const share = round1(bonusPool * (g.delta / totalDelta));
      if (share <= 0) return;
      const fakePlayer = { id: "player-" + g.key, firstName: entry.fullName.split(" ")[0], lastName: entry.fullName.split(" ").slice(1).join(" "), fullName: entry.fullName };
      // awardCustomPoints keys strictly off firstName|lastName (playerKey), which
      // already matches g.key here — the synthetic id above is never read for that.
      awardCustomPoints(io, gameState, fakePlayer, Math.round(share * 10), share);
      payouts.push({ name: entry.fullName, amount: share });
    });
  }

  const closedDayNumber = day.dayNumber;
  postTeamChat(gameState, {
    authorName: "IA — Direction des opérations",
    text: "📊 Clôture de la Journée J" + closedDayNumber + " — résultat net du jour : " + (dayNetIncome >= 0 ? "+" : "") + dayNetIncome + " M$" + (bonusPool > 0 ? ", " + bonusPool + " M$ de primes distribuées." : ", aucune prime (journée négative)."),
    tone: dayNetIncome >= 0 ? "congrats" : "alert"
  });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);

  pushActivity(gameState, { actorPlayerId: null, page: "overview", text: "📊 Journée J" + closedDayNumber + " clôturée — résultat net " + (dayNetIncome >= 0 ? "+" : "") + dayNetIncome + " M$." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);

  // Rating Agency reads dayStartLeagueTable (rival P&L trend) before it gets reset
  // below for the next day -- must run here, not after.
  runRatingAgency(io, gameState);
  accrueCibBonusPool(gameState, dayNetIncome);
  evaluateCibLeadership(io, gameState, dayNetIncome);
  io.to("access:ma").emit("cibBonus:update", gameState.cibBonusPool);
  sweepResignations(io, gameState);
  runPayrollDeduction(io, gameState);

  day.dayNumber += 1;
  day.deadline = Date.now() + DAY_LENGTH_MS * getDifficultyPreset(gameState.difficulty).quarterLength;
  day.dayStartNetIncome = kpis.netIncome;
  day.dayStartScores = snapshotScores(gameState);
  day.dayStartLeagueTable = snapshotLeagueTable(gameState);

  io.to("game").emit("marketDay:update", { dayNumber: day.dayNumber, deadline: day.deadline });
  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });

  return { dayNetIncome, bonusPool, payouts, closedDayNumber };
}

function scheduleMarketDayLoop(io, gameState) {
  function tick() {
    if (!gameState.paused && gameState.marketDay.deadline && Date.now() >= gameState.marketDay.deadline) {
      settleMarketDay(io, gameState);
    }
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
}

function startMarketDayLoop(io, gameState) {
  if (!gameState.marketDay.deadline) {
    gameState.marketDay.deadline = Date.now() + DAY_LENGTH_MS;
    gameState.marketDay.dayStartScores = snapshotScores(gameState);
    gameState.marketDay.dayStartLeagueTable = snapshotLeagueTable(gameState);
  }
  scheduleMarketDayLoop(io, gameState);
  console.log("Journée de marché activée (15 minutes réelles par journée).");
}

module.exports = { startMarketDayLoop, settleMarketDay, DAY_LENGTH_MS };

