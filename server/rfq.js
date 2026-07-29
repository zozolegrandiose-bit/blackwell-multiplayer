// RFQ (Request for Quote) -- AI institutional clients ping the Trading desk
// directly for a price on a large block. The Trader has 15 seconds to quote a
// price; too far from the instrument's reference price and the client walks,
// too close and the spread captured is thin -- a real, fast tradeoff, distinct
// from the slower Dark Pool / structured products flows already in the game.
const { pushActivity, postTeamChat, recordBankPnl } = require("./gameState");
const { awardPoints } = require("./scoring");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";
const RFQ_WINDOW_MS = 15 * 1000;
const SPAWN_MIN_MS = 60 * 1000;
const SPAWN_MAX_MS = 120 * 1000;
const SWEEP_MIN_MS = 3 * 1000;
const SWEEP_MAX_MS = 5 * 1000;
const MAX_ACCEPTABLE_SPREAD = 0.03; // 3% away from reference price still gets accepted
const CLIENT_NAMES = ["Meridian Pension Fund", "Castellan Sovereign Wealth", "Northbridge Asset Managers", "Halden Insurance Group", "Solenne Family Office"];

let nextRfqId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

function spawnRfq(io, gameState) {
  if (gameState.rfqRequests.some(r => !r.resolved)) return; // one live RFQ at a time keeps this readable under pressure
  const markets = gameState.markets;
  if (!markets.instruments.length) return;
  const instrument = markets.instruments[Math.floor(Math.random() * markets.instruments.length)];
  const rfq = {
    id: "rfq" + (nextRfqId++),
    clientName: CLIENT_NAMES[Math.floor(Math.random() * CLIENT_NAMES.length)],
    instrumentId: instrument.id,
    instrumentName: instrument.name,
    side: Math.random() < 0.5 ? "achat" : "vente",
    notional: Math.round((150 + Math.random() * 350) / 10) * 10,
    referencePrice: instrument.price,
    deadline: Date.now() + RFQ_WINDOW_MS,
    resolved: false
  };
  gameState.rfqRequests.unshift(rfq);
  if (gameState.rfqRequests.length > 10) gameState.rfqRequests.length = 10;
  pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "📞 RFQ de " + rfq.clientName + " : " + rfq.side + " " + rfq.notional + " M$ sur " + instrument.name + " — 15 secondes pour coter." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("access:markets").emit("rfq:update", gameState.rfqRequests);
}

// Reusable: mutate + broadcast + log, callable from the socket handler (real
// player) or from server/aiAgents.js's Trader IA heartbeat (Patch 20) — same
// extraction convention as server/handlers/ma.js's advanceRandomDeal. Returns
// the resolved rfq object (with .accepted set), or null if it couldn't resolve.
function respondToRfq(io, gameState, rfq, quotedPrice, actor) {
  if (!rfq || rfq.resolved || Date.now() >= rfq.deadline) return null;
  if (!Number.isFinite(quotedPrice) || quotedPrice <= 0) return null;

  rfq.resolved = true;
  const spread = Math.abs(quotedPrice - rfq.referencePrice) / rfq.referencePrice;
  const accepted = spread <= MAX_ACCEPTABLE_SPREAD;
  rfq.quotedPrice = quotedPrice;
  rfq.accepted = accepted;
  rfq.byPlayerId = actor.id;
  rfq.byName = actor.fullName;

  if (accepted) {
    const profit = round2(rfq.notional * spread * 2); // the captured spread, doubled as the immediate structuring margin on a block trade
    gameState.markets.cash = round2(gameState.markets.cash + profit);
    gameState.markets.realizedPnL = round2(gameState.markets.realizedPnL + profit);
    gameState.markets.tradeLog.unshift({ instrumentName: "RFQ — " + rfq.instrumentName, notional: rfq.notional, pnl: profit, closedByName: actor.fullName, ts: Date.now() });
    if (gameState.markets.tradeLog.length > 30) gameState.markets.tradeLog.length = 30;
    recordBankPnl(gameState, PLAYER_BANK_NAME, profit, 0);
    if (actor.id) awardPoints(io, gameState, actor, "markets_trade"); // synthetic AI actors (id: null) don't hold a score
    pushActivity(gameState, { actorPlayerId: actor.id, page: "markets", text: actor.fullName + " remporte le RFQ de " + rfq.clientName + " à " + quotedPrice + " — +" + profit + " M$." });
    io.to("game").emit("leagueTable:update", gameState.leagueTable);
    if (profit >= 15) {
      postTeamChat(gameState, { authorName: "IA — Salle des marchés", text: "📞 Beau RFQ exécuté par " + actor.fullName + " (+" + profit + " M$) !", tone: "congrats" });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    }
  } else {
    pushActivity(gameState, { actorPlayerId: actor.id, page: "markets", text: actor.fullName + " cote " + quotedPrice + " sur le RFQ de " + rfq.clientName + " — prix trop éloigné, client décline." });
  }

  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("access:markets").emit("markets:update", gameState.markets);
  io.to("access:markets").emit("rfq:update", gameState.rfqRequests);
  return rfq;
}

function registerRfqHandlers(io, socket, gameState) {
  socket.on("markets:respondRfq", payload => {
    if (!requireAccess(socket, "markets")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const rfq = gameState.rfqRequests.find(r => r.id === payload.rfqId && !r.resolved);
    if (!rfq) return;
    respondToRfq(io, gameState, rfq, Number(payload.quotedPrice), player);
  });
}

function sweepRfq(io, gameState) {
  const now = Date.now();
  let changed = false;
  gameState.rfqRequests.forEach(rfq => {
    if (rfq.resolved || now < rfq.deadline) return;
    rfq.resolved = true;
    rfq.accepted = false;
    changed = true;
    pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "⌛ " + rfq.clientName + " retire son RFQ, faute de cotation à temps." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
  if (changed) io.to("access:markets").emit("rfq:update", gameState.rfqRequests);
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startRfqLoop(io, gameState) {
  function spawnTick() {
    if (!gameState.paused) spawnRfq(io, gameState);
    setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));
  }
  setTimeout(spawnTick, randomDelay(SPAWN_MIN_MS, SPAWN_MAX_MS));

  function sweepTick() {
    if (!gameState.paused) sweepRfq(io, gameState);
    setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("RFQ activé (clients institutionnels, cotation sous 15s).");
}

module.exports = { registerRfqHandlers, startRfqLoop, spawnRfq, sweepRfq, respondToRfq, RFQ_WINDOW_MS, MAX_ACCEPTABLE_SPREAD };
