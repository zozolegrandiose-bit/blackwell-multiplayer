// Deal execution workflow — a strict 3-role handoff layered onto an existing M&A
// deal, distinct from the free-form stage dropdown already on the M&A page:
// Analyste M&A (soumet) -> Risk Manager (approuve/refuse, ajuste le taux) ->
// Desk Structuration/Trading (exécute sous 2 minutes) -> impact visible de tous
// (Vue d'ensemble) avec prime automatiquement répartie entre les 3 rôles.
const { pushActivity, postTeamChat, recordBankPnl } = require("../gameState");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";
const { awardPoints, awardCustomPoints, applyHealthDelta } = require("../scoring");

const EXECUTION_WINDOW_MS = 2 * 60 * 1000;
// The AI Risk Manager covers an unattended desk fast (well under the requested
// 10s in practice) — the sweep cadence below is the real binding constraint, this
// delay just avoids resolving on the very same tick a deal was submitted.
const AI_RISK_REVIEW_DELAY_MS = 2 * 1000;
const SWEEP_MIN_MS = 3 * 1000;
const SWEEP_MAX_MS = 5 * 1000;
const FEE_PCT = 0.02;
const BONUS_POOL_PCT = 0.15;
const MAX_EXECUTED_LOG = 20;
const BIG_DEAL_THRESHOLD = 300;
// Syndication de Crédit inter-banques -- distinct from the pre-existing "syndication"
// execution METHOD above (an internal fee-multiplier flavor choice with no rival
// bank involvement). This is a real handoff: only the biggest deals qualify, and
// slices of it are actually offered out to rival banks, who bid to take them on.
const MASSIVE_DEAL_THRESHOLD = 500;
const SYNDICATION_TRANCHE_BANKS = 2;
const SYNDICATION_RIVAL_SHARE = 0.6; // portion of deal value offered out across rival tranches; Blackwell retains the rest as lead
const TRANCHE_RESOLVE_MIN_MS = 5 * 1000;
const TRANCHE_RESOLVE_MAX_MS = 12 * 1000;
const RIVAL_FEE_PCT = 0.02;
const RIVAL_MARGIN_PCT = 0.4;
const RATINGS = ["AAA", "AA", "A", "BBB", "BB", "B"];
const WEAK_RATINGS = ["BB", "B"];
const STRONG_RATINGS = ["AAA", "AA"];
const AI_RISK_ACTOR_NAME = "IA — Gestion des Risques";

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function pickRandomBanks(list, n) {
  const pool = list.slice();
  const picked = [];
  while (picked.length < n && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked;
}

function generateCreditFile() {
  return {
    rating: RATINGS[Math.floor(Math.random() * RATINGS.length)],
    leverage: round1(2 + Math.random() * 4),
    liquidityDays: Math.floor(30 + Math.random() * 60)
  };
}

// Small generated flavor line for the AI Risk Manager's decision — references the
// credit file so it reads as a real (if quick) judgment call, not a rubber stamp.
function generateAiRiskComment(creditFile, rate) {
  if (WEAK_RATINGS.includes(creditFile.rating)) {
    return "Dossier risqué (" + creditFile.rating + ") mais accepté à " + rate + " %.";
  }
  if (STRONG_RATINGS.includes(creditFile.rating)) {
    return "Dossier solide (" + creditFile.rating + "), approuvé à " + rate + " % sans réserve.";
  }
  return "Dossier correct (" + creditFile.rating + "), approuvé à " + rate + " % avec vigilance.";
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

  socket.on("dealWorkflow:proposeSyndication", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!player || !deal || !deal.workflow || deal.workflow.phase !== "pending_execution") return;
    if (deal.valuation < MASSIVE_DEAL_THRESHOLD) return;

    const rivalBanks = Object.keys(gameState.leagueTable).filter(name => name !== PLAYER_BANK_NAME);
    const chosen = pickRandomBanks(rivalBanks, SYNDICATION_TRANCHE_BANKS);
    const trancheAmount = round1((deal.valuation * SYNDICATION_RIVAL_SHARE) / chosen.length);

    deal.workflow.phase = "syndicating";
    deal.workflow.tranches = chosen.map(bankName => ({
      id: "tr" + Date.now() + Math.round(Math.random() * 1000),
      bankName,
      amount: trancheAmount,
      status: "bidding",
      resolveAt: Date.now() + randomDelay(TRANCHE_RESOLVE_MIN_MS, TRANCHE_RESOLVE_MAX_MS)
    }));
    deal.workflow.leadAmount = round1(deal.valuation - trancheAmount * chosen.length);
    deal.workflow.proposedByPlayerId = player.id;
    deal.workflow.proposedByName = player.fullName;

    broadcastDeals(io, gameState);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "markets",
      text: player.fullName + " a proposé de syndiquer « " + deal.name + " » (" + deal.valuation + " M$) — tranches offertes à " + chosen.join(", ") + "."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
}

// Resolves each rival bank's bid on its tranche once its (randomized) response
// delay elapses -- higher approved rate makes the tranche more attractive, so
// more likely to be picked up. Once every tranche has an answer, the deal
// executes automatically: no separate user action closes it out.
function sweepSyndicationTranches(io, gameState) {
  const now = Date.now();
  gameState.maDeals.forEach(deal => {
    if (!deal.workflow || deal.workflow.phase !== "syndicating") return;
    let changed = false;
    deal.workflow.tranches.forEach(tranche => {
      if (tranche.status !== "bidding" || now < tranche.resolveAt) return;
      const acceptChance = Math.max(0.2, Math.min(0.85, 0.3 + (deal.workflow.rate - 5) * 0.04));
      tranche.status = Math.random() < acceptChance ? "accepted" : "rejected";
      changed = true;
      pushActivity(gameState, {
        actorPlayerId: null,
        page: "markets",
        text: tranche.status === "accepted"
          ? "🤝 " + tranche.bankName + " accepte sa tranche de « " + deal.name + " » (" + tranche.amount + " M$)."
          : "🚫 " + tranche.bankName + " décline sa tranche de « " + deal.name + " » (" + tranche.amount + " M$) — elle revient à Blackwell & Co."
      });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
    });
    if (changed) broadcastDeals(io, gameState);

    const allResolved = deal.workflow.tranches.every(t => t.status !== "bidding");
    if (allResolved) executeSyndicatedDeal(io, gameState, deal);
  });
}

// Terminal step for the syndication path, parallel to executeDeal() above but fee
// and bonus are computed only on the amount Blackwell actually retained -- rival
// banks that accepted a tranche book their own (smaller) profit on it via the same
// RIVAL_FEE_PCT/RIVAL_MARGIN_PCT margin already used for stalled-deal losses (ma.js).
function executeSyndicatedDeal(io, gameState, deal) {
  const accepted = deal.workflow.tranches.filter(t => t.status === "accepted");
  const rejectedAmount = deal.workflow.tranches.filter(t => t.status === "rejected").reduce((sum, t) => sum + t.amount, 0);
  const retainedAmount = round1(deal.workflow.leadAmount + rejectedAmount);

  const grossFee = round1(retainedAmount * FEE_PCT);
  const rateModifier = Math.max(0.5, 1 + (deal.workflow.rate - 5) * 0.02);
  const netFee = round1(grossFee * rateModifier);

  const kpis = gameState.financeKPIs;
  const oldNetIncome = kpis.netIncome;
  kpis.revenue = round1(kpis.revenue + grossFee);
  kpis.netIncome = round1(kpis.netIncome + netFee);
  kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: null, byName: "Syndication — " + deal.name });
  if (kpis.history.length > 100) kpis.history.length = 100;

  const bonusPool = round1(netFee * BONUS_POOL_PCT);
  const participants = [
    { id: deal.workflow.submittedByPlayerId, name: deal.workflow.submittedByName, role: "Analyste M&A" },
    { id: deal.workflow.riskDecisionByPlayerId, name: deal.workflow.riskDecisionByName, role: "Risk Manager" },
    { id: deal.workflow.proposedByPlayerId, name: deal.workflow.proposedByName, role: "Desk Trading" }
  ];
  const share = round1(bonusPool / participants.length);
  participants.forEach(p => {
    const participantPlayer = gameState.players.find(pl => pl.id === p.id);
    if (participantPlayer) awardCustomPoints(io, gameState, participantPlayer, Math.round(share * 10), share);
  });

  accepted.forEach(tranche => {
    const rivalProfit = round1(tranche.amount * RIVAL_FEE_PCT * RIVAL_MARGIN_PCT);
    recordBankPnl(gameState, tranche.bankName, rivalProfit, 1);
  });
  if (accepted.length) io.to("game").emit("leagueTable:update", gameState.leagueTable);

  const record = {
    id: "wf" + Date.now(),
    dealName: deal.name,
    method: "syndication_interbanques",
    grossFee,
    netFee,
    bonusPool,
    participants: participants.map(p => ({ name: p.name, role: p.role })),
    executedAt: Date.now()
  };
  gameState.executedWorkflows.unshift(record);
  if (gameState.executedWorkflows.length > MAX_EXECUTED_LOG) gameState.executedWorkflows.length = MAX_EXECUTED_LOG;

  deal.workflow.phase = "executed";
  deal.workflow.method = "syndication_interbanques";
  deal.workflow.netFee = netFee;
  deal.stage = "Clôturé";
  deal.revenueBooked = true;
  recordBankPnl(gameState, PLAYER_BANK_NAME, netFee, 1);

  broadcastDeals(io, gameState);
  io.to("access:finance").emit("finance:update", kpis);
  io.to("game").emit("overview:kpis", kpis);
  io.to("game").emit("executedWorkflows:update", gameState.executedWorkflows);
  io.to("game").emit("leagueTable:update", gameState.leagueTable);
  const acceptedNames = accepted.map(t => t.bankName).join(", ") || "aucune";
  pushActivity(gameState, {
    actorPlayerId: null,
    page: "markets",
    text: "🌐 Syndication de « " + deal.name + " » finalisée — tranches placées auprès de : " + acceptedNames + ". Blackwell & Co retient " + retainedAmount + " M$ (+" + netFee + " M$ net)."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });

  if (deal.valuation >= BIG_DEAL_THRESHOLD) {
    postTeamChat(gameState, {
      authorName: "IA — Salle des marchés",
      text: "🎉 « " + deal.name + " » (" + deal.valuation + " M$) syndiqué avec succès entre plusieurs banques — belle gestion du risque collectif !",
      tone: "congrats"
    });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  }
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
  recordBankPnl(gameState, PLAYER_BANK_NAME, netFee, 1);

  broadcastDeals(io, gameState);
  io.to("access:finance").emit("finance:update", kpis);
  io.to("game").emit("overview:kpis", kpis);
  io.to("game").emit("executedWorkflows:update", gameState.executedWorkflows);
  io.to("game").emit("leagueTable:update", gameState.leagueTable);
  pushActivity(gameState, {
    actorPlayerId: trader.id,
    page: "markets",
    text: trader.fullName + " a exécuté « " + deal.name + " » en " + (method === "syndication" ? "syndication" : "couverture") + " — +" + netFee + " M$, prime de " + bonusPool + " M$ répartie entre les 3 rôles."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });
  awardPoints(io, gameState, trader, "workflow_execute");

  if (deal.valuation >= BIG_DEAL_THRESHOLD) {
    const names = participants.map(p => p.name).join(", ");
    postTeamChat(gameState, {
      authorName: "IA — Salle des marchés",
      text: "🎉 Belle exécution en équipe sur « " + deal.name + " » (" + deal.valuation + " M$) — bravo " + names + " !",
      tone: "congrats"
    });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  }
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

    const aiComment = generateAiRiskComment(deal.workflow.creditFile, deal.workflow.rate);
    deal.workflow.phase = "pending_execution";
    deal.workflow.riskDecisionByPlayerId = null;
    deal.workflow.riskDecisionByName = AI_RISK_ACTOR_NAME;
    deal.workflow.riskDecisionAt = now;
    deal.workflow.executionDeadline = now + EXECUTION_WINDOW_MS;
    deal.workflow.aiComment = aiComment;

    broadcastDeals(io, gameState);
    io.to("access:markets").emit("dealWorkflow:notify", {
      type: "execution_pending",
      dealId: deal.id,
      text: AI_RISK_ACTOR_NAME + " a validé « " + deal.name + " » — " + aiComment
    });
    pushActivity(gameState, { actorPlayerId: null, page: "compliance", text: AI_RISK_ACTOR_NAME + " (en l'absence d'un Risk Manager connecté) : " + aiComment });
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
      sweepSyndicationTranches(io, gameState);
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
  generateAiRiskComment,
  sweepSyndicationTranches,
  executeSyndicatedDeal,
  EXECUTION_WINDOW_MS,
  AI_RISK_REVIEW_DELAY_MS,
  BIG_DEAL_THRESHOLD,
  MASSIVE_DEAL_THRESHOLD,
  SYNDICATION_TRANCHE_BANKS,
  TRANCHE_RESOLVE_MIN_MS,
  TRANCHE_RESOLVE_MAX_MS
};
