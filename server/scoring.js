const { pushActivity } = require("./gameState");

const POINT_VALUES = {
  ma_create: 10,
  ma_advanceStage: 15,
  ma_closeDeal: 50,
  ma_checklistDone: 5,
  ma_icVoteDone: 5,
  clients_create: 10,
  clients_note: 2,
  clients_kycDone: 5,
  compliance_resolve: 15,
  hr_approveLeave: 3,
  hr_onboardingDone: 3,
  hr_hireCandidate: 12,
  finance_allocateBudget: 3,
  finance_capitalAction: 5,
  agenda_create: 3,
  documents_upload: 3,
  expenses_submit: 2,
  expenses_approve: 3,
  event_resolved: 25,
  task_completed: 5,
  hr_distributeBonus: 0,
  markets_open: 4,
  markets_trade: 10
};

// Achievement badges — pure function of the same actionCounts already tracked by
// awardPoints() below, so no separate bookkeeping is needed to compute them.
const ACHIEVEMENTS = [
  { id: "closer", icon: "🏅", label: "Clôtureur", description: "5 deals M&A clôturés", actionType: "ma_closeDeal", threshold: 5 },
  { id: "shield", icon: "🛡️", label: "Bouclier", description: "5 crises résolues à temps", actionType: "event_resolved", threshold: 5 },
  { id: "recruiter", icon: "🎯", label: "Recruteur", description: "3 candidats embauchés", actionType: "hr_hireCandidate", threshold: 3 },
  { id: "generous", icon: "💰", label: "Généreux", description: "A distribué des primes", actionType: "hr_distributeBonus", threshold: 1 },
  { id: "speedy", icon: "⚡", label: "Rapide", description: "15 tâches rapides traitées", actionType: "task_completed", threshold: 15 }
];

function getBadges(actionCounts) {
  if (!actionCounts) return [];
  return ACHIEVEMENTS.filter(a => (actionCounts[a.actionType] || 0) >= a.threshold);
}

// Health deltas tied to specific scored actions. Negative deltas from crisis
// events (market crash, unresolved crises) are applied directly via applyHealthDelta,
// not listed here.
const HEALTH_DELTAS = {
  compliance_resolve: 2,
  ma_closeDeal: 5,
  event_resolved: 5
};

// Ordered richest-first so getTier() can return the first match.
const TIERS = [
  { min: 500, label: "Légende", icon: "💎" },
  { min: 200, label: "Senior", icon: "🥇" },
  { min: 50, label: "Confirmé", icon: "🥈" },
  { min: 0, label: "Stagiaire", icon: "🥉" }
];

function playerKey(player) {
  return (player.firstName + "|" + player.lastName).trim().toLowerCase();
}

function getTier(score) {
  return TIERS.find(t => score >= t.min) || TIERS[TIERS.length - 1];
}

function applyHealthDelta(io, gameState, delta) {
  if (gameState.bankrupt || !delta) return;
  gameState.bankHealth = Math.max(0, Math.min(100, gameState.bankHealth + delta));
  if (gameState.bankHealth === 0) {
    gameState.bankrupt = true;
    io.to("game").emit("game:bankrupt", { playerScores: gameState.playerScores });
  }
}

// Called from handlers (compliance/clients/ma) right after their normal mutation,
// to detect whether that action just resolved an active crisis/opportunity event
// tied to the same target (see server/events.js). Lives here rather than in
// events.js to avoid a circular require (events.js needs to create compliance
// items / deals via those handlers' own exports).
function checkEventResolution(io, gameState, targetId, actor) {
  const idx = gameState.activeEvents.findIndex(e => e.targetId === targetId);
  if (idx === -1) return;
  const [event] = gameState.activeEvents.splice(idx, 1);

  awardPoints(io, gameState, actor, "event_resolved");
  pushActivity(gameState, {
    actorPlayerId: actor ? actor.id : null,
    page: "overview",
    text: (actor ? actor.fullName : "Quelqu'un") + " a résolu à temps : " + event.label + "."
  });
  io.to("game").emit("events:update", gameState.activeEvents);
  io.to("game").emit("event:resolved", { id: event.id, type: event.type, label: event.label });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
}

// Mirrors applyHealthDelta's bankruptcy trigger: checked wherever financeKPIs.aum
// can move (finance:updateKPI, the AI's nudgeRandomKPI, market-crash events, and
// eventually resolveQuarter() in server/strategy.js).
function checkVictory(io, gameState) {
  if (gameState.bankrupt || gameState.victory) return;
  if (gameState.financeKPIs.aum >= gameState.campaignGoal.targetAUM) {
    gameState.victory = true;
    io.to("game").emit("game:victory", { aum: gameState.financeKPIs.aum, quarter: gameState.currentQuarter });
  }
}

// Single choke point for all scoring: called from handlers at meaningful state
// transitions only (never on raw handler invocation) to avoid spam-farming points.
// AI-driven actions (actor.id === null) never earn a human score.
function awardPoints(io, gameState, player, actionType, extraHealthDelta) {
  if (gameState.bankrupt) return;
  if (!player || player.id === null) return;

  let points = POINT_VALUES[actionType] || 0;
  // Direction Générale's standing directive (server/handlers/game.js): a department
  // under an active priority directive earns 50% more points on every scored action —
  // a real, mechanical lever for the CEO to redirect the whole company's effort,
  // not just flavor text.
  if (gameState.directive && player.cluster && gameState.directive.cluster === player.cluster) {
    points = Math.round(points * 1.5);
  }
  const key = playerKey(player);
  if (!gameState.playerScores[key]) {
    gameState.playerScores[key] = { fullName: player.fullName, score: 0, actionCounts: {} };
  }
  const entry = gameState.playerScores[key];
  entry.score += points;
  entry.fullName = player.fullName;
  entry.actionCounts = entry.actionCounts || {};
  entry.actionCounts[actionType] = (entry.actionCounts[actionType] || 0) + 1;
  entry.badges = getBadges(entry.actionCounts);

  const healthDelta = (HEALTH_DELTAS[actionType] || 0) + (extraHealthDelta || 0);
  applyHealthDelta(io, gameState, healthDelta);

  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });
}

// Variable-amount counterpart to awardPoints, for actions whose value isn't a fixed
// lookup (e.g. a bonus distribution the player themself sizes, within a validated pool).
// Tracks a separate bonusEarned running total alongside score, for display purposes.
function awardCustomPoints(io, gameState, player, amount, bonusEarned) {
  if (gameState.bankrupt) return;
  if (!player || player.id === null || !amount) return;

  const key = playerKey(player);
  if (!gameState.playerScores[key]) {
    gameState.playerScores[key] = { fullName: player.fullName, score: 0, bonusEarned: 0 };
  }
  gameState.playerScores[key].score += amount;
  gameState.playerScores[key].fullName = player.fullName;
  gameState.playerScores[key].bonusEarned = (gameState.playerScores[key].bonusEarned || 0) + (bonusEarned || 0);

  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });
}

module.exports = { awardPoints, awardCustomPoints, applyHealthDelta, checkEventResolution, checkVictory, playerKey, getTier, TIERS, POINT_VALUES, ACHIEVEMENTS, getBadges };
