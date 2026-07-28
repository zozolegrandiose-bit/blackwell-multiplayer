// Risk Manager & Compliance made real: a live VaR computed off actual open
// positions (not flavor text), a Kill Switch that genuinely blocks a trader or
// freezes a deal, impromptu regulator audits with a real fine, and the Margin
// Call / forced liquidation loop that gives the VaR panel real teeth.
const { pushActivity, postTeamChat, buildPublicRoster } = require("./gameState");
const { applyHealthDelta } = require("./scoring");
const { countStaleOpenItems } = require("./handlers/compliance");
const { unhedgedDeltaTotal } = require("./structuredProducts");

const VAR_CONFIDENCE_MULTIPLIER = 1.65; // simplified one-day 95% VaR
const PLAYER_VAR_WARNING = 30;
const PLAYER_VAR_CRITICAL = 60;
const MARGIN_CALL_TRIGGER_RATIO = 0.5; // bank VaR vs trading cash
const MARGIN_CALL_SAFE_RATIO = 0.3;
const MARGIN_CALL_WINDOW_MS = 30 * 1000;
const KILL_SWITCH_DURATION_MS = 120 * 1000;
const AUDIT_SPAWN_MIN_MS = 3 * 60 * 1000;
const AUDIT_SPAWN_MAX_MS = 6 * 60 * 1000;
const AUDIT_FINE_PER_VIOLATION = 20;
const UNHEDGED_POSITION_AGE_MS = 5 * 60 * 1000; // a position open this long counts as "uncovered" for audit purposes
const SWEEP_MIN_MS = 4 * 1000;
const SWEEP_MAX_MS = 6 * 1000;

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

// Pure computation, unit-testable directly -- per-position VaR = notional *
// instrument volatility * the confidence multiplier, summed per player and for
// the whole book.
function computeVaR(gameState) {
  const markets = gameState.markets;
  const perPlayer = {};
  let bankTotal = 0;
  markets.positions.forEach(pos => {
    const instrument = markets.instruments.find(i => i.id === pos.instrumentId);
    if (!instrument) return;
    const posVaR = round2(Math.abs(pos.notional) * instrument.volatility * VAR_CONFIDENCE_MULTIPLIER);
    bankTotal += posVaR;
    const key = pos.openedByPlayerId || "unassigned";
    if (!perPlayer[key]) perPlayer[key] = { playerId: pos.openedByPlayerId, playerName: pos.openedByName, var: 0, positionCount: 0 };
    perPlayer[key].var = round2(perPlayer[key].var + posVaR);
    perPlayer[key].positionCount += 1;
  });
  bankTotal += unhedgedDeltaTotal(gameState);
  return { perPlayer: Object.values(perPlayer), bankTotal: round2(bankTotal) };
}

function varStatus(varAmount) {
  if (varAmount >= PLAYER_VAR_CRITICAL) return "critical";
  if (varAmount >= PLAYER_VAR_WARNING) return "warning";
  return "ok";
}

function registerRiskControlHandlers(io, socket, gameState) {
  socket.on("compliance:killSwitchTrader", payload => {
    if (!requireAccess(socket, "compliance")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    const target = gameState.players.find(p => p.id === payload.playerId);
    if (!actor || !target) return;

    target.tradingFrozen = true;
    target.tradingFrozenUntil = Date.now() + KILL_SWITCH_DURATION_MS;
    pushActivity(gameState, { actorPlayerId: actor.id, page: "compliance", text: "🛑 " + actor.fullName + " active le Kill Switch sur " + target.fullName + " — trading interdit " + Math.round(KILL_SWITCH_DURATION_MS / 60000) + " min." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("game").emit("riskControl:update", { killSwitches: gameState.players.filter(p => p.tradingFrozen).map(p => ({ playerId: p.id, until: p.tradingFrozenUntil })) });
    io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
    const targetSocket = io.sockets.sockets.get(target.socketId);
    if (targetSocket) targetSocket.emit("compliance:killSwitched", { untilTs: target.tradingFrozenUntil });
  });

  socket.on("compliance:freezeDeal", payload => {
    if (!requireAccess(socket, "compliance")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!actor || !deal) return;

    deal.frozen = true;
    deal.frozenUntil = Date.now() + KILL_SWITCH_DURATION_MS;
    pushActivity(gameState, { actorPlayerId: actor.id, page: "compliance", text: "🛑 " + actor.fullName + " gèle « " + deal.name + " » — risque de défaut jugé trop élevé." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:ma").to("access:compliance").to("access:markets").emit("ma:update", gameState.maDeals);
  });

  socket.on("compliance:injectMarginCash", () => {
    if (!requireAccess(socket, "compliance")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    if (!actor || !gameState.marginCall.active) return;

    const amount = gameState.marginCall.requiredAmount;
    const kpis = gameState.financeKPIs;
    const oldNetIncome = kpis.netIncome;
    kpis.netIncome = round1(kpis.netIncome - amount);
    kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: actor.id, byName: actor.fullName + " (injection Margin Call)" });
    if (kpis.history.length > 100) kpis.history.length = 100;
    gameState.markets.cash = round2(gameState.markets.cash + amount);

    gameState.marginCall = { active: false, deadline: null, requiredAmount: 0 };
    io.to("access:finance").emit("finance:update", kpis);
    io.to("game").emit("overview:kpis", kpis);
    io.to("access:markets").emit("markets:update", gameState.markets);
    io.to("game").emit("marginCall:update", gameState.marginCall);
    pushActivity(gameState, { actorPlayerId: actor.id, page: "compliance", text: "💉 " + actor.fullName + " injecte " + amount + " M$ pour répondre au Margin Call — positions sauvées." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Contrôle des risques", text: "💉 Margin Call couvert à temps — belle réactivité du Risk Manager.", tone: "congrats" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  });
}

// Called from a dedicated sweep loop -- checks whether the book's aggregate VaR
// has crossed the trigger ratio against available trading cash, and (separately)
// whether an already-active margin call's 30s window has lapsed without an
// injection, in which case the single largest position is force-liquidated.
function sweepMarginCall(io, gameState) {
  const { bankTotal } = computeVaR(gameState);
  const markets = gameState.markets;
  const marginCall = gameState.marginCall;

  if (!marginCall.active && markets.cash > 0 && bankTotal > markets.cash * MARGIN_CALL_TRIGGER_RATIO) {
    const requiredAmount = round1(bankTotal - markets.cash * MARGIN_CALL_SAFE_RATIO);
    gameState.marginCall = { active: true, deadline: Date.now() + MARGIN_CALL_WINDOW_MS, requiredAmount };
    pushActivity(gameState, { actorPlayerId: null, page: "compliance", text: "🚨 Margin Call : la VaR du book (" + bankTotal + " M$) dépasse le capital disponible — 30 secondes pour injecter " + requiredAmount + " M$ ou une position sera liquidée d'office." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Contrôle des risques", text: "🚨 MARGIN CALL — le Risk Manager doit injecter du cash sous 30 secondes.", tone: "alert" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    io.to("game").emit("marginCall:update", gameState.marginCall);
    return;
  }

  if (marginCall.active && Date.now() >= marginCall.deadline) {
    if (!markets.positions.length) {
      gameState.marginCall = { active: false, deadline: null, requiredAmount: 0 };
      io.to("game").emit("marginCall:update", gameState.marginCall);
      return;
    }
    const worst = markets.positions.slice().sort((a, b) => Math.abs(b.notional) - Math.abs(a.notional))[0];
    const instrument = markets.instruments.find(i => i.id === worst.instrumentId);
    const pnl = instrument ? round2(worst.notional * (instrument.price / worst.entryPrice - 1)) : 0;
    const loss = Math.min(pnl, -Math.abs(worst.notional * 0.15)); // a forced liquidation is always at least a real loss, never a silver lining
    markets.positions.splice(markets.positions.indexOf(worst), 1);
    markets.cash = round2(markets.cash + worst.notional + loss);
    markets.realizedPnL = round2(markets.realizedPnL + loss);
    markets.tradeLog.unshift({ instrumentName: (instrument && instrument.name) || "?", notional: worst.notional, pnl: loss, closedByName: "Liquidation forcée", ts: Date.now() });
    if (markets.tradeLog.length > 30) markets.tradeLog.length = 30;

    applyHealthDelta(io, gameState, -8);
    gameState.marginCall = { active: false, deadline: null, requiredAmount: 0 };
    io.to("access:markets").emit("markets:update", markets);
    io.to("game").emit("marginCall:update", gameState.marginCall);
    pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "⚖️ Position sur " + (instrument ? instrument.name : "?") + " liquidée d'office (" + loss + " M$) — le Risk Manager n'a pas injecté de cash à temps." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Contrôle des risques", text: "⚖️ Liquidation forcée — perte réelle actée sur le book.", tone: "alert" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  }
}

function sweepKillSwitchExpiry(io, gameState) {
  const now = Date.now();
  let changed = false;
  gameState.players.forEach(p => {
    if (p.tradingFrozen && now >= p.tradingFrozenUntil) {
      p.tradingFrozen = false;
      p.tradingFrozenUntil = null;
      changed = true;
      const s = io.sockets.sockets.get(p.socketId);
      if (s) s.emit("compliance:killSwitchLifted", {});
    }
  });
  gameState.maDeals.forEach(d => {
    if (d.frozen && now >= d.frozenUntil) {
      d.frozen = false;
      d.frozenUntil = null;
      changed = true;
    }
  });
  if (changed) {
    io.to("game").emit("riskControl:update", { killSwitches: gameState.players.filter(p => p.tradingFrozen).map(p => ({ playerId: p.id, until: p.tradingFrozenUntil })) });
    io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
    io.to("access:ma").to("access:compliance").to("access:markets").emit("ma:update", gameState.maDeals);
  }
}

// Impromptu regulator audit -- checks stale open compliance items (already
// tracked by server/handlers/compliance.js's quarterly-audit helper, reused here
// for a more dramatic random trigger) plus positions left open unhedged too long.
function runImpromptuAudit(io, gameState) {
  const staleCompliance = countStaleOpenItems(gameState);
  const staleNow = Date.now();
  const uncoveredPositions = gameState.markets.positions.filter(p => staleNow - p.openedAt >= UNHEDGED_POSITION_AGE_MS).length;
  const violations = staleCompliance + uncoveredPositions;

  if (violations === 0) {
    pushActivity(gameState, { actorPlayerId: null, page: "compliance", text: "🕵️ Contrôle impromptu du régulateur — aucune anomalie relevée." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    return;
  }

  const fine = round1(violations * AUDIT_FINE_PER_VIOLATION);
  const kpis = gameState.financeKPIs;
  const oldNetIncome = kpis.netIncome;
  kpis.netIncome = round1(kpis.netIncome - fine);
  kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: null, byName: "Amende régulateur (audit impromptu)" });
  if (kpis.history.length > 100) kpis.history.length = 100;
  applyHealthDelta(io, gameState, -Math.min(15, violations * 3));

  io.to("access:finance").emit("finance:update", kpis);
  io.to("game").emit("overview:kpis", kpis);
  pushActivity(gameState, { actorPlayerId: null, page: "compliance", text: "🕵️ Audit impromptu du régulateur : " + violations + " anomalie(s) relevée(s) (alertes non traitées, positions non couvertes) — amende de " + fine + " M$." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  postTeamChat(gameState, { authorName: "IA — Régulateur", text: "🕵️ Contrôle SEC/BCE impromptu : " + fine + " M$ d'amende pour " + violations + " manquement(s).", tone: "alert" });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startRiskControlLoop(io, gameState) {
  function sweepTick() {
    if (!gameState.paused) {
      sweepMarginCall(io, gameState);
      sweepKillSwitchExpiry(io, gameState);
    }
    setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));

  function auditTick() {
    if (!gameState.paused) runImpromptuAudit(io, gameState);
    setTimeout(auditTick, randomDelay(AUDIT_SPAWN_MIN_MS, AUDIT_SPAWN_MAX_MS));
  }
  setTimeout(auditTick, randomDelay(AUDIT_SPAWN_MIN_MS, AUDIT_SPAWN_MAX_MS));
  console.log("Contrôle des risques activé (VaR, Kill Switch, Margin Call, audits impromptus).");
}

module.exports = {
  registerRiskControlHandlers, startRiskControlLoop, computeVaR, varStatus, sweepMarginCall, sweepKillSwitchExpiry, runImpromptuAudit,
  VAR_CONFIDENCE_MULTIPLIER, PLAYER_VAR_WARNING, PLAYER_VAR_CRITICAL, MARGIN_CALL_TRIGGER_RATIO, MARGIN_CALL_SAFE_RATIO, MARGIN_CALL_WINDOW_MS,
  KILL_SWITCH_DURATION_MS, AUDIT_FINE_PER_VIOLATION
};
