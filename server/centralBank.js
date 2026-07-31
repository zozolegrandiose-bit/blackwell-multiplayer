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

  // Multi-Asset Macro Correlation Engine (Patch 29) -- Fed and ECB moves ripple
  // independently through their own currency/equity block (a Fed-only hike
  // shouldn't move the CAC 40), plus cross-currency and safe-haven effects a
  // single combined "risk-off" direction can't express: USD strengthens on a
  // Fed hike (EUR/USD and GBP/USD fall, USD/JPY rises), gold falls with it
  // (higher real rates raise the opportunity cost of a non-yielding asset),
  // and the Bund tracks the ECB rate directly the same way US 10Y/Euribor do.
  const fedSign = fedMove > 0 ? 1 : fedMove < 0 ? -1 : 0;
  const ecbSign = ecbMove > 0 ? 1 : ecbMove < 0 ? -1 : 0;
  const fedScale = Math.abs(fedMove) / 25 || 0;
  const ecbScale = Math.abs(ecbMove) / 25 || 0;

  const bund = findInstrument(gameState, "rate-bund");
  if (bund) { bund.price = Math.max(1, round2(bund.price + ecbMove)); bund.history.push(bund.price); }

  applyRippleMove(findInstrument(gameState, "idx-sp500"), -fedSign * 0.012 * fedScale);
  applyRippleMove(findInstrument(gameState, "idx-nasdaq"), -fedSign * 0.016 * fedScale);
  applyRippleMove(findInstrument(gameState, "idx-cac40"), -ecbSign * 0.01 * ecbScale);
  applyRippleMove(findInstrument(gameState, "idx-nikkei"), direction * 0.005 * (Math.abs(combinedMove) / 25 || 0));
  applyRippleMove(findInstrument(gameState, "cmd-gold"), -fedSign * 0.006 * fedScale);
  applyRippleMove(findInstrument(gameState, "fx-gbpusd"), -fedSign * 0.0025 * fedScale);
  applyRippleMove(findInstrument(gameState, "fx-usdjpy"), fedSign * 0.003 * fedScale);
  applyRippleMove(findInstrument(gameState, "fx-eurusd"), (-fedSign * 0.003 * fedScale) + (ecbSign * 0.003 * ecbScale));

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
