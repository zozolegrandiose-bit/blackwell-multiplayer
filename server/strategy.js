const { pushActivity } = require("./gameState");
const { applyHealthDelta, checkVictory } = require("./scoring");
const { recomputeAum, recomputeCapitalRatio, recomputeBudgetPool, CAPITAL_RATIO_FLOOR } = require("./handlers/finance");
const { openPosition } = require("./handlers/hr");
const { countStaleOpenItems } = require("./handlers/compliance");
const { getDifficultyPreset } = require("./difficulty");

const QUARTER_HISTORY_MAX = 12;
const COMPLIANCE_FINE_PER_STALE_ITEM = 4; // M$ off netIncome, per audit-flagged open item
const ESG_SCORE_MIN = 0, ESG_SCORE_MAX = 100;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

const QUARTER_LENGTH_MS = 90 * 1000;

const CLUSTER_LABELS = {
  A: "Dealmaking (M&A, ECM, DCM…)",
  B: "Marchés & Recherche",
  C: "Gestion de Fortune & Actifs",
  D: "Conformité, Risque & Juridique",
  E: "Finance & Trésorerie",
  F: "RH & Communication",
  G: "Direction Générale"
};

const OPERATIONAL_CLUSTERS = ["A", "B", "C", "D", "E", "F"];

// aumPct/netIncomePct are fractional deltas applied to financeKPIs by resolveQuarter()
// (server/strategy.js, wired in a later milestone). health is a flat delta on bankHealth.
// Each cluster's index-1 option ("selective", "neutral", "status_quo", "standard",
// "consolidate", "train") is the deliberate middle ground, used as the default for
// any cluster with nobody connected when the quarter resolves.
const CLUSTER_OPTIONS = {
  A: [
    { id: "aggressive", label: "Pipeline agressif", description: "Multiplier les mandats, quitte à prendre plus de risque.", aumPct: 0.02, netIncomePct: 0.01, health: -3 },
    { id: "selective", label: "Sélectif", description: "Ne retenir que les dossiers les plus solides.", aumPct: 0.005, netIncomePct: 0.005, health: 0 },
    { id: "defensive", label: "Défensif", description: "Ralentir le pipeline, protéger la réputation.", aumPct: 0, netIncomePct: 0, health: 2 }
  ],
  B: [
    { id: "risky", label: "Position risquée", description: "Prises de position agressives sur les marchés.", aumPct: 0.015, netIncomePct: 0.02, health: -4, rwaPct: 0.03 },
    { id: "neutral", label: "Neutre", description: "Exposition mesurée.", aumPct: 0.005, netIncomePct: 0.005, health: 0, rwaPct: 0 },
    { id: "hedge", label: "Couverture", description: "Se couvrir contre la volatilité.", aumPct: 0, netIncomePct: 0, health: 2, rwaPct: -0.02 }
  ],
  C: [
    { id: "campaign", label: "Campagne d'acquisition", description: "Investir dans l'acquisition de nouveaux clients.", aumPct: 0.02, netIncomePct: -0.005, health: -1 },
    { id: "status_quo", label: "Statu quo", description: "Maintenir le portefeuille actuel.", aumPct: 0, netIncomePct: 0, health: 0 },
    { id: "retention", label: "Fidélisation", description: "Renforcer la relation avec les clients existants.", aumPct: 0.005, netIncomePct: 0.005, health: 1 }
  ],
  D: [
    { id: "minimal", label: "Minimal", description: "Réduire les contrôles pour économiser.", aumPct: 0, netIncomePct: 0.01, health: -3, esgDelta: -4 },
    { id: "standard", label: "Standard", description: "Maintenir le niveau de contrôle actuel.", aumPct: 0, netIncomePct: 0, health: 0, esgDelta: 0 },
    { id: "reinforced", label: "Renforcé", description: "Investir dans la conformité.", aumPct: 0, netIncomePct: -0.005, health: 3, esgDelta: 5 }
  ],
  E: [
    { id: "invest", label: "Investir", description: "Financer la croissance.", aumPct: 0.01, netIncomePct: 0.015, health: -1 },
    { id: "consolidate", label: "Consolider", description: "Stabiliser le bilan.", aumPct: 0, netIncomePct: 0, health: 1 },
    { id: "distribute", label: "Distribuer", description: "Verser un dividende, rassurer les actionnaires.", aumPct: 0, netIncomePct: -0.01, health: 2 }
  ],
  F: [
    { id: "recruit", label: "Recruter", description: "Renforcer les équipes.", aumPct: 0, netIncomePct: -0.01, health: 0 },
    { id: "train", label: "Former", description: "Investir dans les compétences existantes.", aumPct: 0, netIncomePct: -0.003, health: 1 },
    { id: "freeze", label: "Geler", description: "Économiser sur la masse salariale.", aumPct: 0, netIncomePct: 0.005, health: 0 }
  ]
};

const G_MULTIPLIERS = {
  growth: { label: "Croissance", description: "Amplifie les effets (positifs et négatifs) des décisions du trimestre.", scale: 1.5, netIncomeBonusPct: 0 },
  stability: { label: "Stabilité", description: "Atténue les effets, positifs comme négatifs.", scale: 0.7, netIncomeBonusPct: 0 },
  costcutting: { label: "Réduction des coûts", description: "Effets atténués, mais bonus de résultat net garanti.", scale: 0.7, netIncomeBonusPct: 0.01 }
};

function getDefaultOption(cluster) {
  return CLUSTER_OPTIONS[cluster][1].id;
}

// Direction Générale (cluster G) is the one point of real cross-cluster
// interdependency: they see the other clusters' actual locked-in choices before
// picking their own multiplier. Everyone else only sees submitted/pending status —
// this redacts option ids down to booleans for that broadcast.
function redactDecisions(decisions) {
  return Object.keys(decisions).reduce((acc, cluster) => {
    acc[cluster] = true;
    return acc;
  }, {});
}

// Per-viewer decisions view: G sees everything; everyone else sees redacted status
// for other clusters but their OWN cluster's real choice (so they can see what they
// just locked in, not a redacted "true").
function buildDecisionsView(gameState, viewerCluster) {
  if (viewerCluster === "G") return { ...gameState.quarterDecisions };
  const view = redactDecisions(gameState.quarterDecisions);
  if (viewerCluster && gameState.quarterDecisions[viewerCluster] !== undefined) {
    view[viewerCluster] = gameState.quarterDecisions[viewerCluster];
  }
  return view;
}

// Pure-ish core (its only side effects are on gameState/io, no timers/sockets involved) —
// unit-testable directly with synthetic gameState objects. Combines the 6 operational
// clusters' decisions (or their neutral default if a cluster submitted nothing) with
// Direction Générale's multiplier, updates financeKPIs/bankHealth, advances the quarter,
// and re-opens a fresh deciding phase. Callers (the resolution loop, or an
// all-6-submitted shortcut, both added in a later milestone) are responsible for not
// calling this twice for the same quarter.
function resolveQuarter(io, gameState) {
  if (gameState.bankrupt || gameState.victory) return null;
  // Idempotency guard: flips synchronously, before any other mutation or the first
  // `await`-free line below, so two near-simultaneous triggers (the "all 6 submitted"
  // shortcut and the deadline sweep loop) can't both resolve the same quarter — Node
  // runs each event-loop callback to completion before the next starts, so whichever
  // trigger's tick runs second sees "resolved" here and bails out immediately.
  if (gameState.quarterPhase !== "deciding") return null;
  gameState.quarterPhase = "resolved";

  const decisions = gameState.quarterDecisions;
  let aumPct = 0, netIncomePct = 0, healthDelta = 0;

  OPERATIONAL_CLUSTERS.forEach(cluster => {
    const optionId = decisions[cluster] || getDefaultOption(cluster);
    const option = CLUSTER_OPTIONS[cluster].find(o => o.id === optionId);
    aumPct += option.aumPct;
    netIncomePct += option.netIncomePct;
    healthDelta += option.health;
    if (cluster === "B" && option.rwaPct) {
      gameState.financeKPIs.riskWeightedAssets = Math.round(gameState.financeKPIs.riskWeightedAssets * (1 + option.rwaPct));
    }
    if (cluster === "F" && optionId === "recruit") {
      openPosition(gameState);
    }
    if (cluster === "D" && option.esgDelta) {
      gameState.financeKPIs.esgScore = Math.max(ESG_SCORE_MIN, Math.min(ESG_SCORE_MAX, gameState.financeKPIs.esgScore + option.esgDelta));
    }
  });

  const gOptionId = decisions.G || "stability";
  const multiplier = G_MULTIPLIERS[gOptionId] || G_MULTIPLIERS.stability;
  aumPct *= multiplier.scale;
  netIncomePct = netIncomePct * multiplier.scale + (multiplier.netIncomeBonusPct || 0);

  const kpis = gameState.financeKPIs;
  const oldAum = kpis.aum;
  kpis.aumLegacyBase = Math.round(kpis.aumLegacyBase * (1 + aumPct));
  recomputeAum(gameState);
  kpis.netIncome = Math.round(kpis.netIncome * (1 + netIncomePct) * 10) / 10;
  kpis.revenue = Math.round(kpis.revenue * (1 + aumPct / 2) * 10) / 10;
  kpis.history.unshift({ ts: Date.now(), field: "aum", oldValue: oldAum, newValue: kpis.aum, byPlayerId: null, byName: "Comité de Direction" });
  if (kpis.history.length > 100) kpis.history.length = 100;

  recomputeBudgetPool(gameState);
  recomputeCapitalRatio(gameState);
  // Realistic financial/HR risk feeding back into the shared Bank Health gauge —
  // an undercapitalized bank or a demoralized workforce both drag on health each
  // quarter, on top of whatever the 6 cluster decisions produced.
  if (kpis.capitalRatio < CAPITAL_RATIO_FLOOR) healthDelta -= 5;
  if (gameState.hr.morale < 40) healthDelta -= 3;

  // Quarterly regulatory audit: alerts left open too long (server/handlers/compliance.js)
  // cost real money and health, mirroring the capital-ratio/morale checks above.
  const staleComplianceCount = countStaleOpenItems(gameState);
  if (staleComplianceCount > 0) {
    kpis.netIncome = Math.round((kpis.netIncome - staleComplianceCount * COMPLIANCE_FINE_PER_STALE_ITEM) * 10) / 10;
    healthDelta -= Math.min(10, staleComplianceCount * 2);
  }

  const resolvedQuarter = gameState.currentQuarter;
  const report = { quarter: resolvedQuarter, decisions: { ...decisions }, aumPct, netIncomePct, healthDelta, newAum: kpis.aum, newNetIncome: kpis.netIncome, esgScore: kpis.esgScore, staleComplianceCount, ts: Date.now() };

  gameState.quarterHistory.unshift(report);
  if (gameState.quarterHistory.length > QUARTER_HISTORY_MAX) gameState.quarterHistory.length = QUARTER_HISTORY_MAX;

  pushActivity(gameState, {
    actorPlayerId: null,
    page: "strategy",
    text: "📋 Trimestre T" + resolvedQuarter + " résolu — AUM " + (aumPct >= 0 ? "+" : "") + Math.round(aumPct * 1000) / 10 + "%, santé " + (healthDelta >= 0 ? "+" : "") + healthDelta + "."
  });

  gameState.currentQuarter += 1;
  gameState.quarterDecisions = {};
  gameState.quarterPhase = "deciding";
  gameState.quarterDeadline = Date.now() + QUARTER_LENGTH_MS * getDifficultyPreset(gameState.difficulty).quarterLength;

  applyHealthDelta(io, gameState, healthDelta);
  io.to("game").emit("finance:update", kpis);
  io.to("game").emit("overview:kpis", kpis);
  io.to("access:hr").emit("hr:update", gameState.hr);
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("game").emit("strategy:quarterResolved", report);
  io.to("game").emit("strategy:update", { quarterDecisions: gameState.quarterDecisions, currentQuarter: gameState.currentQuarter, quarterDeadline: gameState.quarterDeadline });
  io.to("game").emit("scoring:update", { playerScores: gameState.playerScores, bankHealth: gameState.bankHealth });

  checkVictory(io, gameState);

  return report;
}

function registerStrategyHandlers(io, socket, gameState) {
  socket.on("strategy:submitDecision", payload => {
    if (!requireAccess(socket, "strategy")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.cluster) return;
    if (gameState.quarterPhase !== "deciding") return;
    if (gameState.quarterDecisions[player.cluster]) return; // already locked this quarter

    const validOptions = player.cluster === "G"
      ? Object.keys(G_MULTIPLIERS)
      : CLUSTER_OPTIONS[player.cluster].map(o => o.id);
    if (!validOptions.includes(payload.optionId)) return;

    gameState.quarterDecisions[player.cluster] = payload.optionId;
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "strategy",
      text: player.fullName + " a verrouillé la décision de " + CLUSTER_LABELS[player.cluster] + " pour ce trimestre."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    // Per-player payload (not a single room broadcast): each player sees their own
    // cluster's real choice plus redacted status for everyone else; G sees everything.
    gameState.players.forEach(p => {
      const targetSocket = io.sockets.sockets.get(p.socketId);
      if (!targetSocket) return;
      targetSocket.emit("strategy:update", { quarterDecisions: buildDecisionsView(gameState, p.cluster) });
    });

    // Pace lever: resolve immediately once every cluster (6 operational + Direction
    // Générale) has locked in, instead of waiting out the rest of the deadline.
    const allSubmitted = OPERATIONAL_CLUSTERS.every(c => gameState.quarterDecisions[c]) && gameState.quarterDecisions.G;
    if (allSubmitted) resolveQuarter(io, gameState);
  });

  socket.on("strategy:extendQuarter", () => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.hasFullAccess) return;
    if (gameState.quarterPhase !== "deciding") return;
    gameState.quarterDeadline = (gameState.quarterDeadline || Date.now()) + 60 * 1000;
    io.to("game").emit("strategy:update", { quarterDeadline: gameState.quarterDeadline });
    pushActivity(gameState, { actorPlayerId: player.id, page: "strategy", text: player.fullName + " a prolongé le trimestre en cours de 60 secondes." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
}

const RESOLUTION_SWEEP_MIN_MS = 2000;
const RESOLUTION_SWEEP_MAX_MS = 3000;

function randomSweepDelay() {
  return RESOLUTION_SWEEP_MIN_MS + Math.random() * (RESOLUTION_SWEEP_MAX_MS - RESOLUTION_SWEEP_MIN_MS);
}

// Third independent self-rescheduling loop (same convention as server/ai.js and
// server/events.js) — catches quarters where the deadline passes without every
// cluster having submitted. resolveQuarter()'s own idempotency guard makes it safe
// for this to overlap with the immediate-resolution shortcut above.
function scheduleResolutionLoop(io, gameState) {
  function tick() {
    if (!gameState.paused && gameState.quarterPhase === "deciding" && gameState.quarterDeadline && Date.now() >= gameState.quarterDeadline) {
      resolveQuarter(io, gameState);
    }
    setTimeout(tick, randomSweepDelay());
  }
  setTimeout(tick, randomSweepDelay());
}

function startStrategyLoop(io, gameState) {
  if (!gameState.quarterDeadline) gameState.quarterDeadline = Date.now() + QUARTER_LENGTH_MS;
  scheduleResolutionLoop(io, gameState);
}

module.exports = { registerStrategyHandlers, resolveQuarter, startStrategyLoop, redactDecisions, buildDecisionsView, CLUSTER_LABELS, CLUSTER_OPTIONS, G_MULTIPLIERS, OPERATIONAL_CLUSTERS, getDefaultOption, QUARTER_LENGTH_MS };
