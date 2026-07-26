const { pushActivity } = require("../gameState");
const { checkVictory, awardPoints } = require("../scoring");

const FIELD_LABELS = {
  revenue: "Revenus",
  netIncome: "Résultat net",
  aum: "AUM",
  costIncomeRatio: "Coefficient d'exploitation"
};

// Only the operational efficiency ratio drifts ambiently (AI, when the page is
// vacant) — revenue/netIncome/aum are now derived exclusively from real actions
// (deal closings, client AUM, quarterly resolution), never typed in or nudged directly.
const AI_NUDGE_FIELDS = ["costIncomeRatio"];

const DEAL_FEE_PCT = 0.02; // advisory fee booked on a closed deal's valuation
const DEAL_MARGIN_PCT = 0.4; // share of that fee that flows through to net income
const BUDGET_POOL_REVENUE_PCT = 0.4; // opex pool sized as a share of revenue
const DIVIDEND_NETINCOME_PCT = 0.3;
const RETAIN_NETINCOME_PCT = 0.2;
const CAPITAL_RATIO_FLOOR = 8; // % CET1 below which the bank takes a health hit

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function recomputeAum(gameState) {
  const activeAum = gameState.clients.filter(c => c.status === "Actif").reduce((sum, c) => sum + (c.aum || 0), 0);
  gameState.financeKPIs.aum = gameState.financeKPIs.aumLegacyBase + activeAum;
}

function recomputeCapitalRatio(gameState) {
  const kpis = gameState.financeKPIs;
  kpis.capitalRatio = Math.round((kpis.equity / kpis.riskWeightedAssets) * 1000) / 10;
}

function recomputeBudgetPool(gameState) {
  const kpis = gameState.financeKPIs;
  kpis.budgetPool.total = Math.round(kpis.revenue * BUDGET_POOL_REVENUE_PCT);
  kpis.budgetPool.allocated = kpis.budgetVsActual.reduce((sum, r) => sum + r.budget, 0);
}

// Called from server/handlers/ma.js the moment a deal first reaches "Clôturé" —
// this is the realism fix for finance: revenue/netIncome used to be typed in by
// hand with no link to what actually happened on the M&A desk.
function applyDealRevenue(io, gameState, deal) {
  const kpis = gameState.financeKPIs;
  const fee = round1(deal.valuation * DEAL_FEE_PCT);
  const profit = round1(fee * DEAL_MARGIN_PCT);
  const oldRevenue = kpis.revenue;
  kpis.revenue = round1(kpis.revenue + fee);
  kpis.netIncome = round1(kpis.netIncome + profit);
  kpis.history.unshift({ ts: Date.now(), field: "revenue", oldValue: oldRevenue, newValue: kpis.revenue, byPlayerId: null, byName: "Clôture M&A — " + deal.name });
  if (kpis.history.length > 100) kpis.history.length = 100;
  recomputeBudgetPool(gameState);

  io.to("access:finance").emit("finance:update", kpis);
  io.to("game").emit("overview:kpis", kpis);
  checkVictory(io, gameState);
}

// Reusable ambient action for server/ai.js when nobody has access to "finance":
// only ever drifts costIncomeRatio (an operational efficiency read, plausible to
// wobble on its own) — never revenue/netIncome/aum, which must trace back to a
// real action (deal closing, client AUM, quarterly resolution).
function nudgeOperatingRatio(io, gameState, actor) {
  const field = "costIncomeRatio";
  const oldValue = gameState.financeKPIs[field];
  const pctChange = (Math.random() * 3 - 1.5) / 100;
  const newValue = round1(oldValue * (1 + pctChange));
  gameState.financeKPIs[field] = newValue;
  gameState.financeKPIs.history.unshift({
    ts: Date.now(), field, oldValue, newValue, byPlayerId: actor.id, byName: actor.fullName
  });
  if (gameState.financeKPIs.history.length > 100) gameState.financeKPIs.history.length = 100;

  io.to("access:finance").emit("finance:update", gameState.financeKPIs);
  pushActivity(gameState, {
    actorPlayerId: actor.id,
    page: "finance",
    text: actor.fullName + " a mis à jour " + FIELD_LABELS[field] + "."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  return true;
}

function registerFinanceHandlers(io, socket, gameState) {
  socket.on("finance:updateBudgetActual", payload => {
    if (!requireAccess(socket, "finance")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const row = gameState.financeKPIs.budgetVsActual.find(r => r.dept === payload.dept);
    const newValue = Number(payload.actual);
    if (!row || Number.isNaN(newValue)) return;

    row.actual = newValue;
    io.to("access:finance").emit("finance:update", gameState.financeKPIs);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "finance",
      text: player.fullName + " a mis à jour le réalisé budgétaire de " + payload.dept + "."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  socket.on("finance:allocateBudget", payload => {
    if (!requireAccess(socket, "finance")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const kpis = gameState.financeKPIs;
    const row = kpis.budgetVsActual.find(r => r.dept === payload.dept);
    const newBudget = Number(payload.budget);
    if (!row || Number.isNaN(newBudget) || newBudget < 0) return;

    const availableWithoutRow = kpis.budgetPool.total - (kpis.budgetPool.allocated - row.budget);
    if (newBudget > availableWithoutRow) {
      socket.emit("finance:allocateBudget:rejected", { reason: "Pool budgétaire insuffisant — il reste " + round1(availableWithoutRow) + " M$ disponibles." });
      return;
    }

    row.budget = round1(newBudget);
    recomputeBudgetPool(gameState);
    io.to("access:finance").emit("finance:update", kpis);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "finance",
      text: player.fullName + " a réalloué le budget de " + payload.dept + " à " + row.budget + " M$."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    awardPoints(io, gameState, player, "finance_allocateBudget");
  });

  socket.on("finance:capitalAction", payload => {
    if (!requireAccess(socket, "finance")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const kpis = gameState.financeKPIs;
    const quarter = gameState.currentQuarter;

    if (payload.action === "dividend") {
      if (kpis.lastDividendQuarter === quarter) {
        socket.emit("finance:capitalAction:rejected", { reason: "Un dividende a déjà été versé ce trimestre." });
        return;
      }
      const amount = round1(Math.min(kpis.netIncome * DIVIDEND_NETINCOME_PCT, kpis.equity * 0.1));
      kpis.equity = round1(kpis.equity - amount);
      kpis.lastDividendQuarter = quarter;
      recomputeCapitalRatio(gameState);
      pushActivity(gameState, { actorPlayerId: player.id, page: "finance", text: player.fullName + " a fait verser un dividende de " + amount + " M$ aux actionnaires." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      io.to("access:finance").emit("finance:update", kpis);
      awardPoints(io, gameState, player, "finance_capitalAction", 2);
    } else if (payload.action === "retain") {
      if (kpis.lastRetainQuarter === quarter) {
        socket.emit("finance:capitalAction:rejected", { reason: "Les fonds propres ont déjà été renforcés ce trimestre." });
        return;
      }
      const amount = round1(kpis.netIncome * RETAIN_NETINCOME_PCT);
      kpis.equity = round1(kpis.equity + amount);
      kpis.lastRetainQuarter = quarter;
      recomputeCapitalRatio(gameState);
      pushActivity(gameState, { actorPlayerId: player.id, page: "finance", text: player.fullName + " a renforcé les fonds propres de " + amount + " M$." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      io.to("access:finance").emit("finance:update", kpis);
      awardPoints(io, gameState, player, "finance_capitalAction");
    } else {
      socket.emit("finance:capitalAction:rejected", { reason: "Action inconnue." });
    }
  });
}

module.exports = {
  registerFinanceHandlers,
  FIELD_LABELS,
  AI_NUDGE_FIELDS,
  nudgeOperatingRatio,
  recomputeAum,
  recomputeCapitalRatio,
  recomputeBudgetPool,
  applyDealRevenue,
  CAPITAL_RATIO_FLOOR
};
