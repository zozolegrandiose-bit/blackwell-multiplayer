// Cérémonie des Trophées -- a full session is 4 "Journées de Bourse" of 15
// minutes real time (1h total). Called from settleMarketDay() once the 4th day
// closes, instead of starting a 5th. Every trophy is computed from data this
// game already tracks (league table P&L, executed workflow bonus shares, trade
// log, HR action counts) rather than adding new bookkeeping just for this.
const { pushActivity, postTeamChat } = require("./gameState");
const { recordSessionHistory } = require("./persistence");

const MAX_TRADING_DAYS = 4;
const HR_POSITIVE_ACTIONS = ["hr_approveLeave", "hr_distributeBonus", "hr_onboardingDone", "hr_hireCandidate"];

function round1(n) {
  return Math.round(n * 10) / 10;
}

function bankOfTheYear(gameState) {
  const banks = Object.keys(gameState.leagueTable).map(name => ({ name, pnl: gameState.leagueTable[name].pnl }));
  if (!banks.length) return null;
  return banks.sort((a, b) => b.pnl - a.pnl)[0];
}

function dealmakerOfTheYear(gameState) {
  const totals = {};
  gameState.executedWorkflows.forEach(record => {
    const analyst = record.participants.find(p => p.role === "Analyste M&A");
    if (!analyst) return;
    const share = round1(record.bonusPool / record.participants.length);
    totals[analyst.name] = round1((totals[analyst.name] || 0) + share);
  });
  const entries = Object.entries(totals);
  if (!entries.length) return null;
  const [name, value] = entries.sort((a, b) => b[1] - a[1])[0];
  return { name, value };
}

function starTrader(gameState) {
  const totals = {};
  gameState.markets.tradeLog.forEach(t => {
    if (!t.closedByName || t.closedByName === "Liquidation forcée") return;
    totals[t.closedByName] = round1((totals[t.closedByName] || 0) + t.pnl);
  });
  const entries = Object.entries(totals);
  if (!entries.length) return null;
  const [name, value] = entries.sort((a, b) => b[1] - a[1])[0];
  return { name, value };
}

function bestEmployer(gameState) {
  const totals = {};
  Object.values(gameState.playerScores).forEach(entry => {
    const count = HR_POSITIVE_ACTIONS.reduce((sum, action) => sum + ((entry.actionCounts || {})[action] || 0), 0);
    if (count > 0) totals[entry.fullName] = count;
  });
  const entries = Object.entries(totals);
  if (!entries.length) return null;
  const [name, value] = entries.sort((a, b) => b[1] - a[1])[0];
  return { name, value };
}

function computeTrophies(gameState) {
  return {
    bankOfTheYear: bankOfTheYear(gameState),
    dealmakerOfTheYear: dealmakerOfTheYear(gameState),
    starTrader: starTrader(gameState),
    bestEmployer: bestEmployer(gameState)
  };
}

// Called from settleMarketDay() once the 4th day closes -- freezes the whole
// game via the existing `paused` flag (every timed loop in this codebase already
// checks it) rather than touching each system individually to stop it.
function endSession(io, gameState) {
  const trophies = computeTrophies(gameState);
  gameState.sessionEnded = true;
  gameState.trophies = trophies;
  gameState.paused = true;

  pushActivity(gameState, { actorPlayerId: null, page: "overview", text: "🏆 Fin de la session — Cérémonie des Trophées !" });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  postTeamChat(gameState, { authorName: "IA — Direction des opérations", text: "🏆 Les 4 Journées de Bourse sont closes — place à la Cérémonie des Trophées !", tone: "congrats" });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  io.to("game").emit("session:trophies", trophies);
  recordSessionHistory(gameState, trophies);
}

module.exports = { computeTrophies, endSession, MAX_TRADING_DAYS };
