// Deal execution workflow — a strict 3-role handoff layered onto an existing M&A
// deal, distinct from the free-form stage dropdown already on the M&A page:
// Analyste M&A (soumet) -> Risk Manager (approuve/refuse, ajuste le taux) ->
// Desk Structuration/Trading (exécute sous 2 minutes) -> impact visible de tous
// (Vue d'ensemble) avec prime automatiquement répartie entre les 3 rôles.
const { pushActivity } = require("../gameState");
const { awardPoints, awardCustomPoints, applyHealthDelta } = require("../scoring");

const EXECUTION_WINDOW_MS = 2 * 60 * 1000;
const AI_RISK_REVIEW_DELAY_MS = 90 * 1000;
const SWEEP_MIN_MS = 5 * 1000;
const SWEEP_MAX_MS = 8 * 1000;
const FEE_PCT = 0.02;
const BONUS_POOL_PCT = 0.15;
const MAX_EXECUTED_LOG = 20;
const RATINGS = ["AAA", "AA", "A", "BBB", "BB", "B"];
const AI_RISK_ACTOR_NAME = "IA — Gestion des Risques";

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function generateCreditFile() {
  return {
    rating: RATINGS[Math.floor(Math.random() * RATINGS.length)],
    leverage: round1(2 + Math.random() * 4),
    liquidityDays: Math.floor(30 + Math.random() * 60)
  };
}

// Broadcast the full deal list to all three rooms whose pages now surface
// workflow-derived panels (M&A itself, plus Compliance and Markets, which don't
// otherwise get maDeals) — simpler than maintaining three separate filtered views,
// and harmless since every field here is already read-only cooperative info.
function broadcastDeals(io, gameState) {
  ["ma", "compliance", "markets"].forEach(page => {
    io.to("access:" + page).emit("ma:update", gameState.maDeals);
  });
}

function registerDealWorkflowHandlers(io, socket, gameState) {
  socket.on("dealWorkflow:submitToRisk", payload => {
    if (!requireAccess(socket, "ma")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!player || !deal || deal.workflow || deal.stage === "Clôturé") return;
    const rate = Number(payload.rate);
    if (Number.isNaN(rate) || rate <= 0) return;

    deal.workflow = {
      phase: "pending_risk",
      rate: round1(rate),
      creditFile: generateCreditFile(),
      submittedByPlayerId: player.id,
      submittedByName: player.fullName,
      submittedAt: Date.now()
    };

    broadcastDeals(io, gameState);
    io.to("access:compliance").emit("dealWorkflow:notify", {
      type: "risk_review",
      dealId: deal.id,
      text: player.fullName + " a soumis « " + deal.name + " » au Risque (taux proposé " + deal.workflow.rate + " %)."
    });
    pushActivity(gameState, { actorPlayerId: player.id, page: "ma", text: player.fullName + " a soumis « " + deal.name + " » au Risque." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    awardPoints(io, gameState, player, "workflow_submitRisk");
  });

  socket.on("dealWorkflow:riskDecision", payload => {
    if (!requireAccess(socket, "compliance")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!player || !deal || !deal.workflow || deal.workflow.phase !== "pending_risk") return;
    if (!["approve", "reject"].includes(payload.decision)) return;

    if (payload.decision === "reject") {
      const dealName = deal.name;
      deal.workflow = null;
      broadcastDeals(io, gameState);
      io.to("access:ma").emit("dealWorkflow:notify", { type: "risk_rejected", dealId: deal.id, text: player.fullName + " a refusé « " + dealName + " » — dossier à revoir." });
      pushActivity(gameState, { actorPlayerId: player.id, page: "compliance", text: player.fullName + " a refusé la demande de financement de « " + dealName + " »." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      return;
    }

    const adjustedRate = payload.rate != null ? Number(payload.rate) : deal.workflow.rate;
    if (Number.isNaN(adjustedRate) || adjustedRate <= 0) return;

    deal.workflow.phase = "pending_execution";
    deal.workflow.rate = round1(adjustedRate);
    deal.workflow.riskDecisionByPlayerId = player.id;
    deal.workflow.riskDecisionByName = player.fullName;
    deal.workflow.riskDecisionAt = Date.now();
    deal.workflow.executionDeadline = Date.now() + EXECUTION_WINDOW_MS;

    broadcastDeals(io, gameState);
    io.to("access:markets").emit("dealWorkflow:notify", {
      type: "execution_pending",
      dealId: deal.id,
      text: player.fullName + " a validé « " + deal.name + " » (taux " + deal.workflow.rate + " %) — exécution requise sous 2 minutes."
    });
    pushActivity(gameState, { actorPlayerId: player.id, page: "compliance", text: player.fullName + " a validé le financement de « " + deal.name + " » (taux " + deal.workflow.rate + " %)." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    awardPoints(io, gameState, player, "workflow_riskDecision");
  });

  socket.on("dealWorkflow:execute", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!player || !deal || !deal.workflow || deal.workflow.phase !== "pending_execution") return;
    if (!["syndication", "couverture"].includes(payload.method)) return;

    executeDeal(io, gameState, deal, payload.method, player);
  });
}

function executeDeal(io, gameState, deal, method, trader) {
  const grossFee = round1(deal.valuation * FEE_PCT);
  const methodMultiplier = method === "syndication" ? 0.40 : 0.75;
  const rateModifier = Math.max(0.5, 1 + (deal.workflow.rate - 5) * 0.02);
  const netFee = round1(grossFee * methodMultiplier * rateModifier);

  const kpis = gameState.financeKPIs;
  const oldNetIncome = kpis.netIncome;
  kpis.revenue = round1(kpis.revenue + grossFee);
  kpis.netIncome = round1(kpis.netIncome + netFee);
  kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: null, byName: "Exécution — " + deal.name });
  if (kpis.history.length > 100) kpis.history.length = 100;

  const bonusPool = round1(netFee * BONUS_POOL_PCT);
  const participants = [
    { id: deal.workflow.submittedByPlayerId, name: deal.workflow.submittedByName, role: "Analyste M&A" },
    { id: deal.workflow.riskDecisionByPlayerId, name: deal.workflow.riskDecisionByName, role: "Risk Manager" },
    { id: trader.id, name: trader.fullName, role: "Desk Trading" }
  ];
  const share = round1(bonusPool / participants.length);
  participants.forEach(p => {
    const participantPlayer = gameState.players.find(pl => pl.id === p.id);
    if (participantPlayer) awardCustomPoints(io, gameState, participantPlayer, Math.round(share * 10), share);
  });

  const record = {
    id: "wf" + Date.now(),
    dealName: deal.name,
    method,
    grossFee,
    netFee,
    bonusPool,
    participants: participants.map(p => ({ name: p.name, role: p.role })),
    executedAt: Date.now()
  };
  gameState.executedWorkflows.unshift(record);
  if (gameState.executedWorkflows.length > MAX_EXECUTED_LOG) gameState.executedWorkflows.length = MAX_EXECUTED_LOG;

  deal.workflow.phase = "executed";
  deal.workflow.method = method;
  deal.workflow.netFee = netFee;
  deal.stage = "Clôturé";
  deal.revenueBooked = true;

  broadcastDeals(io, gameState);
  io.to("access:finance").emit("finance:update", kpis);
  io.to("game").emit("overview:kpis", kpis);
  io.to("game").emit("executedWorkflows:update", gameState.executedWorkflows);
  pushActivity(gameState, {
    actorPlayerId: trader.id,
    page: "markets",
    text: trader.fullName + " a exécuté « " + deal.name + " » en " + (method === "syndication" ? "syndication" : "couverture") + " — +" + netFee + " M$, prime de " + bonusPool + " M$ répartie entre les 3 rôles."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });
  awardPoints(io, gameState, trader, "workflow_execute");
}

// Two ambient behaviors, both deliberately scoped: the Risk Manager step can be
// covered by AI when nobody with compliance access is connected (matching the
// user's explicit "joueur ou IA" for that role); the execution step never gets an
// AI fallback — the 2-minute chrono is a real stake, same design choice already
// made for the Patch 10 var_breach live event (risk-type steps stay human-only).
function aiReviewPendingRisk(io, gameState) {
  const room = io.sockets.adapter.rooms.get("access:compliance");
  if (room && room.size > 0) return;
  const now = Date.now();
  gameState.maDeals.forEach(deal => {
    if (!deal.workflow || deal.workflow.phase !== "pending_risk") return;
    if (now - deal.workflow.submittedAt < AI_RISK_REVIEW_DELAY_MS) return;

    deal.workflow.phase = "pending_execution";
    deal.workflow.riskDecisionByPlayerId = null;
    deal.workflow.riskDecisionByName = AI_RISK_ACTOR_NAME;
    deal.workflow.riskDecisionAt = now;
    deal.workflow.executionDeadline = now + EXECUTION_WINDOW_MS;

    broadcastDeals(io, gameState);
    io.to("access:markets").emit("dealWorkflow:notify", {
      type: "execution_pending",
      dealId: deal.id,
      text: AI_RISK_ACTOR_NAME + " a validé « " + deal.name + " » (taux " + deal.workflow.rate + " %) — exécution requise sous 2 minutes."
    });
    pushActivity(gameState, { actorPlayerId: null, page: "compliance", text: AI_RISK_ACTOR_NAME + " a validé le financement de « " + deal.name + " » en l'absence d'un Risk Manager connecté." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
}

function sweepExpiredExecutions(io, gameState) {
  const now = Date.now();
  let changed = false;
  gameState.maDeals.forEach(deal => {
    if (!deal.workflow || deal.workflow.phase !== "pending_execution") return;
    if (now < deal.workflow.executionDeadline) return;
    deal.workflow.phase = "expired";
    changed = true;
    applyHealthDelta(io, gameState, -5);
    pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "⌛ Exécution de « " + deal.name + " » non réalisée à temps — occasion manquée, santé de la banque -5." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });
  });
  if (changed) broadcastDeals(io, gameState);
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function scheduleSweepLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) {
      sweepExpiredExecutions(io, gameState);
      aiReviewPendingRisk(io, gameState);
    }
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
}

function startDealWorkflowLoop(io, gameState) {
  scheduleSweepLoop(io, gameState);
  console.log("Workflow d'exécution des deals activé (revue risque, exécution sous 2 min).");
}

module.exports = {
  registerDealWorkflowHandlers,
  startDealWorkflowLoop,
  executeDeal,
  sweepExpiredExecutions,
  aiReviewPendingRisk,
  generateCreditFile,
  EXECUTION_WINDOW_MS,
  AI_RISK_REVIEW_DELAY_MS
};
