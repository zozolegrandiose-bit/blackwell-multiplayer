// Regulatory Stress Testing & Basel Ratios (Patch 22) -- an AI regulator
// periodically checks each regional entity's Tier 1 capital ratio (server/
// globalBank.js's per-entity capitalRatioPct, itself editable by the Head of
// CIB/DRH Global/Board Of Directors from the Global Footprint page) against a
// Basel minimum. Non-compliance is not cosmetic: it triggers a real capital
// penalty on the offending entity AND a bank-wide bonus-distribution
// restriction, gated directly into server/cibBonus.js and server/handlers/hr.js's
// existing (already-tested) distribute handlers rather than a parallel system.
const { pushActivity, postTeamChat } = require("./gameState");

const BASEL_MIN_TIER1_PCT = 10.5;
const SWEEP_MIN_MS = 90 * 1000;
const SWEEP_MAX_MS = 150 * 1000;
const CAPITAL_PENALTY_RATIO = 0.05;
const BONUS_RESTRICTION_MS = 4 * 60 * 1000;

function round1(n) {
  return Math.round(n * 10) / 10;
}
function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

// Shared gate -- called from cibBonus.js's cib:distributeBonus and hr.js's
// hr:distributeBonus/hr:autoDistributeBonus, so a Basel failure has real teeth
// rather than just a dashboard warning.
function isBonusDistributionRestricted(gameState) {
  return !!(gameState.stressTest.bonusRestrictedUntil && gameState.stressTest.bonusRestrictedUntil > Date.now());
}

// Pure-ish core (only touches gameState/entity objects, no io) -- directly
// unit-testable, same convention as server/centralBank.js's decision function.
function runStressTest(gameState) {
  const now = Date.now();
  const entities = gameState.globalBank.entities;
  const results = entities.map(e => ({ id: e.id, name: e.name, capitalRatioPct: e.capitalRatioPct, compliant: e.capitalRatioPct >= BASEL_MIN_TIER1_PCT }));
  const failing = results.filter(r => !r.compliant);

  failing.forEach(r => {
    const entity = entities.find(e => e.id === r.id);
    const penalty = round1(entity.allocatedCapital * CAPITAL_PENALTY_RATIO);
    entity.allocatedCapital = round1(entity.allocatedCapital - penalty);
    r.capitalPenalty = penalty;
  });

  if (failing.length) {
    gameState.stressTest.bonusRestrictedUntil = now + BONUS_RESTRICTION_MS;
  }
  gameState.stressTest.lastRunAt = now;
  gameState.stressTest.lastResults = results;
  return { results, failing };
}

function announceStressTest(io, gameState) {
  const { results, failing } = runStressTest(gameState);

  if (!failing.length) {
    pushActivity(gameState, { actorPlayerId: null, page: "global", text: "📐 Stress Test réglementaire : toutes les entités respectent le ratio Tier 1 minimum (" + BASEL_MIN_TIER1_PCT + "%)." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  } else {
    const names = failing.map(f => f.name + " (" + f.capitalRatioPct + "%, -" + f.capitalPenalty + " M$)").join(", ");
    pushActivity(gameState, { actorPlayerId: null, page: "global", text: "🚨 Stress Test réglementaire échoué : " + names + " — en-dessous du seuil Basel de " + BASEL_MIN_TIER1_PCT + "%. Distribution de bonus restreinte pendant " + Math.round(BONUS_RESTRICTION_MS / 60000) + " minutes." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, {
      authorName: "IA — Régulateur (Stress Test)",
      text: "🚨 " + failing.map(f => f.name).join(", ") + " en non-conformité Basel — fonds propres pénalisés, primes gelées le temps de se redresser.",
      tone: "alert"
    });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    io.to("access:global").emit("globalBank:update", gameState.globalBank);
  }
  io.to("game").emit("stressTest:update", gameState.stressTest);
}

function startRegulatoryStressTestLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) announceStressTest(io, gameState);
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Regulatory Stress Testing & Basel Ratios activé (contrôle toutes les 90-150s).");
}

module.exports = {
  startRegulatoryStressTestLoop, runStressTest, announceStressTest, isBonusDistributionRestricted,
  BASEL_MIN_TIER1_PCT, CAPITAL_PENALTY_RATIO, BONUS_RESTRICTION_MS
};
