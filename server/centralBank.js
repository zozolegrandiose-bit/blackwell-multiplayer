// Central Bank & Monetary Policy (Patch 22) -- an AI Fed and an AI ECB each
// periodically announce a rate decision + an inflation reading. Both are real,
// tradeable instruments (server/gameState.js's MARKET_INSTRUMENTS_SEED: "US 10Y"
// / "Euribor 3M", price in basis points) that the Trading desk AND the Treasury
// desk (cluster E gained "markets" access this patch) can open positions on --
// this is what makes the announcement a genuine arbitrage opportunity rather
// than flavor text. Every decision also ripples into the rest of the market
// (bonds inversely, equities/crypto with a muted directional nudge) for the
// "volatilité de marché en direct" the request asks for.
const { pushActivity, postTeamChat } = require("./gameState");

const DECISION_MIN_MS = 3 * 60 * 1000;
const DECISION_MAX_MS = 5 * 60 * 1000;
const RATE_MOVES_BPS = [-50, -25, -25, 0, 0, 0, 25, 25, 50]; // weighted toward hold/small moves
const MAX_HISTORY = 20;

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}
function rollRateMove() {
  return RATE_MOVES_BPS[Math.floor(Math.random() * RATE_MOVES_BPS.length)];
}
function rollInflation(current) {
  return round1(Math.max(0.5, current + (Math.random() * 2 - 1) * 0.4));
}

function findInstrument(gameState, id) {
  return gameState.markets.instruments.find(i => i.id === id);
}

function applyRippleMove(instrument, pct) {
  if (!instrument) return;
  instrument.price = Math.max(1, round2(instrument.price * (1 + pct)));
  instrument.history.push(instrument.price);
}

// Pure-ish core (only touches gameState + instrument objects, no io) so it's
// directly unit-testable -- broadcasting is the caller's job, same convention
// as server/riskControl.js's computeVaR.
function runMonetaryPolicyDecision(gameState) {
  const cb = gameState.centralBank;
  const fedMove = rollRateMove();
  const ecbMove = rollRateMove();
  cb.fedRateBps = Math.max(0, cb.fedRateBps + fedMove);
  cb.ecbRateBps = Math.max(0, cb.ecbRateBps + ecbMove);
  cb.lastInflationUS = rollInflation(cb.lastInflationUS);
  cb.lastInflationEU = rollInflation(cb.lastInflationEU);
  cb.lastDecisionAt = Date.now();

  const usRate = findInstrument(gameState, "rate-us10y");
  const euRate = findInstrument(gameState, "rate-euribor");
  if (usRate) { usRate.price = Math.max(1, round2(usRate.price + fedMove)); usRate.history.push(usRate.price); }
  if (euRate) { euRate.price = Math.max(1, round2(euRate.price + ecbMove)); euRate.history.push(euRate.price); }

  // Ripple: a hike pressures bond prices down and equities/crypto down (risk-off);
  // a cut does the reverse -- muted vs. the rate instruments themselves.
  const combinedMove = fedMove + ecbMove;
  const direction = combinedMove === 0 ? 0 : combinedMove > 0 ? -1 : 1;
  applyRippleMove(findInstrument(gameState, "bond-sov"), direction * 0.006 * (Math.abs(combinedMove) / 25 || 0));
  applyRippleMove(findInstrument(gameState, "eq-tech"), direction * 0.01 * (Math.abs(combinedMove) / 25 || 0));
  applyRippleMove(findInstrument(gameState, "eq-industrial"), direction * 0.008 * (Math.abs(combinedMove) / 25 || 0));
  applyRippleMove(findInstrument(gameState, "crypto"), direction * 0.02 * (Math.abs(combinedMove) / 25 || 0));

  const entry = {
    ts: cb.lastDecisionAt, fedMove, ecbMove,
    fedRateBps: cb.fedRateBps, ecbRateBps: cb.ecbRateBps,
    inflationUS: cb.lastInflationUS, inflationEU: cb.lastInflationEU
  };
  cb.history.unshift(entry);
  if (cb.history.length > MAX_HISTORY) cb.history.length = MAX_HISTORY;
  return entry;
}

function moveLabel(bps) {
  if (bps > 0) return "hausse de " + bps + " bps";
  if (bps < 0) return "baisse de " + Math.abs(bps) + " bps";
  return "statu quo";
}

function announceMonetaryPolicyDecision(io, gameState) {
  const entry = runMonetaryPolicyDecision(gameState);

  pushActivity(gameState, {
    actorPlayerId: null, page: "markets",
    text: "🏛 Banque Centrale (Fed) : " + moveLabel(entry.fedMove) + " — taux directeur à " + entry.fedRateBps + " bps, inflation US à " + entry.inflationUS + "%. BCE : " + moveLabel(entry.ecbMove) + " — taux à " + entry.ecbRateBps + " bps, inflation zone euro à " + entry.inflationEU + "%."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  postTeamChat(gameState, {
    authorName: "IA — Banque Centrale",
    text: "🏛 Décision de politique monétaire : Fed " + moveLabel(entry.fedMove) + ", BCE " + moveLabel(entry.ecbMove) + " — les taux US 10Y et Euribor viennent de bouger, à vos positions.",
    tone: entry.fedMove !== 0 || entry.ecbMove !== 0 ? "alert" : "congrats"
  });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);

  io.to("game").emit("centralBank:update", gameState.centralBank);
  io.to("access:markets").emit("markets:update", gameState.markets);
  io.to("game").emit("globalTicker:update", gameState.markets.instruments.map(i => ({ id: i.id, name: i.name, price: i.price, category: i.category })));
}

function startCentralBankLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) announceMonetaryPolicyDecision(io, gameState);
    setTimeout(tick, randomDelay(DECISION_MIN_MS, DECISION_MAX_MS));
  }
  setTimeout(tick, randomDelay(DECISION_MIN_MS, DECISION_MAX_MS));
  console.log("Banque Centrale & Politique Monétaire activée (décisions Fed/BCE toutes les 3-5 min).");
}

module.exports = { startCentralBankLoop, runMonetaryPolicyDecision, announceMonetaryPolicyDecision, moveLabel };
