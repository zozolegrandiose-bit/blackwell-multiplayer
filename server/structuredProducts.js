// Produits Structurés & Swaps -- AI-generated corporate clients periodically show
// up needing a specific kind of hedge (rate, FX, commodity, credit exposure). A
// Trader picks a structure to package for them; picking one that actually matches
// the exposure type earns a real, meaningfully bigger fee than reaching for
// whatever's handy -- the "sur-mesure" part isn't just flavor text.
const { pushActivity, postTeamChat } = require("./gameState");
const { awardPoints, applyHealthDelta } = require("./scoring");

const SPAWN_MIN_MS = 2 * 60 * 1000;
const SPAWN_MAX_MS = 4 * 60 * 1000;
const EXPIRY_MS = 3 * 60 * 1000;
const SWEEP_MIN_MS = 5 * 1000;
const SWEEP_MAX_MS = 8 * 1000;
const FEE_PCT_MATCHED = 0.015;
const FEE_PCT_MISMATCHED = 0.005;

const CLIENT_NAMES = ["Northgate Manufacturing", "Aurea Shipping Lines", "Ferrovia Rail Holdings", "Solenne Agritrade", "Kessler Petrochemicals", "Vantage Aerospace Corp"];
const EXPOSURE_TYPES = ["Taux d'intérêt", "Change", "Matières Premières", "Crédit"];
const STRUCTURE_TYPES = ["Swap de taux", "Collar (Cap+Floor)", "Option Vanille", "Swap de devises", "Swap de matières premières"];
const STRUCTURE_MATCH = {
  "Taux d'intérêt": ["Swap de taux", "Collar (Cap+Floor)"],
  "Change": ["Swap de devises"],
  "Matières Premières": ["Swap de matières premières"],
  "Crédit": ["Option Vanille"]
};
// Delta Hedging -- packaging a derivative leaves the bank exposed to a fraction
// of its notional; leaving that delta unhedged past the window counts as extra
// phantom VaR (server/riskControl.js's computeVaR sums gameState.pendingHedges
// alongside real spot positions), which is what can actually trigger a Margin
// Call -- hedging it (any spot trade via markets:hedgeDelta) clears it.
const DELTA_FACTOR = {
  "Swap de taux": 0.8,
  "Collar (Cap+Floor)": 0.3,
  "Option Vanille": 0.5,
  "Swap de devises": 0.8,
  "Swap de matières premières": 0.8
};
const HEDGE_WINDOW_MS = 90 * 1000;

let nextRequestId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function spawnHedgingRequest(io, gameState) {
  const clientName = CLIENT_NAMES[Math.floor(Math.random() * CLIENT_NAMES.length)];
  const exposureType = EXPOSURE_TYPES[Math.floor(Math.random() * EXPOSURE_TYPES.length)];
  const notional = Math.round((80 + Math.random() * 320) / 10) * 10;
  const request = {
    id: "hr" + (nextRequestId++),
    clientName,
    exposureType,
    notional,
    ts: Date.now(),
    deadline: Date.now() + EXPIRY_MS
  };
  gameState.hedgingRequests.push(request);
  pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "🏭 " + clientName + " recherche une couverture (" + exposureType + ", notionnel " + notional + " M$) — un Trader peut lui packager un produit sur-mesure." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("access:markets").emit("structuredProducts:update", { hedgingRequests: gameState.hedgingRequests, structuredProducts: gameState.structuredProducts, pendingHedges: gameState.pendingHedges });
}

function registerStructuredProductsHandlers(io, socket, gameState) {
  socket.on("markets:createStructuredProduct", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const idx = gameState.hedgingRequests.findIndex(r => r.id === payload.requestId);
    if (idx === -1 || !STRUCTURE_TYPES.includes(payload.structureType)) return;
    const request = gameState.hedgingRequests[idx];

    const matched = (STRUCTURE_MATCH[request.exposureType] || []).includes(payload.structureType);
    const fee = round1(request.notional * (matched ? FEE_PCT_MATCHED : FEE_PCT_MISMATCHED));

    gameState.hedgingRequests.splice(idx, 1);
    const kpis = gameState.financeKPIs;
    const oldNetIncome = kpis.netIncome;
    kpis.revenue = round1(kpis.revenue + fee);
    kpis.netIncome = round1(kpis.netIncome + fee);
    kpis.history.unshift({ ts: Date.now(), field: "netIncome", oldValue: oldNetIncome, newValue: kpis.netIncome, byPlayerId: null, byName: "Produit structuré — " + request.clientName });
    if (kpis.history.length > 100) kpis.history.length = 100;

    const product = {
      id: "sp" + Date.now() + Math.round(Math.random() * 1000),
      clientName: request.clientName,
      exposureType: request.exposureType,
      structureType: payload.structureType,
      notional: request.notional,
      fee,
      matched,
      byPlayerId: player.id,
      byName: player.fullName,
      ts: Date.now()
    };
    gameState.structuredProducts.unshift(product);
    if (gameState.structuredProducts.length > 30) gameState.structuredProducts.length = 30;

    const deltaExposure = round1(request.notional * (DELTA_FACTOR[payload.structureType] || 0.5));
    gameState.pendingHedges.push({
      id: "hedge" + Date.now() + Math.round(Math.random() * 1000),
      productId: product.id,
      clientName: request.clientName,
      structureType: payload.structureType,
      deltaExposure,
      hedged: false,
      deadline: Date.now() + HEDGE_WINDOW_MS
    });

    awardPoints(io, gameState, player, "markets_trade");
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "markets",
      text: player.fullName + " packagé un " + payload.structureType + " pour " + request.clientName + (matched ? " (bien adapté à l'exposition, +" + fee + " M$)" : " (structure peu adaptée, +" + fee + " M$ seulement)") + "."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:finance").emit("finance:update", kpis);
    io.to("game").emit("overview:kpis", kpis);
    io.to("access:markets").emit("structuredProducts:update", { hedgingRequests: gameState.hedgingRequests, structuredProducts: gameState.structuredProducts, pendingHedges: gameState.pendingHedges });

    if (matched && request.notional >= 300) {
      postTeamChat(gameState, { authorName: "IA — Salle des marchés", text: "🧩 Beau produit structuré sur-mesure pour " + request.clientName + " (" + payload.structureType + ") — bien joué " + player.fullName + " !", tone: "congrats" });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    }
  });

  socket.on("markets:hedgeDelta", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const hedge = gameState.pendingHedges.find(h => h.id === payload.hedgeId && !h.hedged);
    if (!hedge) return;

    hedge.hedged = true;
    pushActivity(gameState, { actorPlayerId: player.id, page: "markets", text: player.fullName + " couvre le delta du " + hedge.structureType + " (" + hedge.clientName + ") sur le marché spot — exposition neutralisée." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:markets").emit("structuredProducts:update", { hedgingRequests: gameState.hedgingRequests, structuredProducts: gameState.structuredProducts, pendingHedges: gameState.pendingHedges });
  });
}

// Called from server/riskControl.js's computeVaR() -- unhedged delta from
// structured products counts as phantom exposure alongside real spot positions,
// for as long as it stays unhedged (no expiry removal -- the risk is real until
// a trader actually covers it).
function unhedgedDeltaTotal(gameState) {
  return gameState.pendingHedges.filter(h => !h.hedged).reduce((sum, h) => sum + h.deltaExposure, 0);
}

// Fires the "resté non couvert" warning exactly once per hedge, once its 90s
// window lapses -- purely informational (the phantom VaR contribution already
// applies regardless via unhedgedDeltaTotal above), entries are only ever
// removed once actually hedged.
function sweepPendingHedges(io, gameState) {
  const now = Date.now();
  gameState.pendingHedges.forEach(h => {
    if (h.hedged || h.warned || now < h.deadline) return;
    h.warned = true;
    pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "⚠️ Delta du " + h.structureType + " (" + h.clientName + ") resté non couvert — la VaR du book en tient compte tant qu'il n'est pas hedgé." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
}

function sweepHedgingRequests(io, gameState) {
  const now = Date.now();
  const before = gameState.hedgingRequests.length;
  const expired = gameState.hedgingRequests.filter(r => now >= r.deadline);
  if (!expired.length) return;
  gameState.hedgingRequests = gameState.hedgingRequests.filter(r => now < r.deadline);
  expired.forEach(r => {
    applyHealthDelta(io, gameState, -2);
    pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "⌛ " + r.clientName + " renonce à sa demande de couverture, faute de réponse à temps." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
  io.to("access:markets").emit("structuredProducts:update", { hedgingRequests: gameState.hedgingRequests, structuredProducts: gameState.structuredProducts, pendingHedges: gameState.pendingHedges });
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startStructuredProductsLoop(io, gameState) {
  function spawnTick() {
    if (!gameState.paused) spawnHedgingRequest(io, gameState);
    setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));
  }
  setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));

  function sweepTick() {
    if (!gameState.paused) {
      sweepHedgingRequests(io, gameState);
      sweepPendingHedges(io, gameState);
    }
    setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Produits Structurés & Swaps activé (nouvelle demande de couverture toutes les 2-4 min).");
}

module.exports = {
  registerStructuredProductsHandlers, startStructuredProductsLoop, spawnHedgingRequest, sweepHedgingRequests, sweepPendingHedges, unhedgedDeltaTotal,
  STRUCTURE_TYPES, STRUCTURE_MATCH, EXPOSURE_TYPES, FEE_PCT_MATCHED, FEE_PCT_MISMATCHED, DELTA_FACTOR, HEDGE_WINDOW_MS
};
