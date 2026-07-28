// Global Ticker Tape -- a persistent header (lives in #global-ticker, outside
// #app so it survives every page switch/renderApp() innerHTML replacement,
// same convention as #toast-container/#tutorial-overlay). Shows 4 world indices
// and 4 financial-capital clocks.
//
// The 4 "indices" (S&P 500 / EUR-USD / US 10Y / Brent) are honestly derived from
// this game's own simulated market instruments (public/js/join.js's
// appState.publicTicker, itself server/handlers/markets.js's publicInstrumentTicker())
// rather than a real external market data feed -- this game has never called any
// real financial API, staying consistent with its entirely self-contained economy.
const TICKER_CLOCKS = [
  { label: "NEW YORK", tz: "America/New_York" },
  { label: "LONDRES", tz: "Europe/London" },
  { label: "TOKYO", tz: "Asia/Tokyo" },
  { label: "HONG KONG", tz: "Asia/Hong_Kong" }
];

// Seed baselines mirror server/gameState.js's MARKET_INSTRUMENTS_SEED starting
// prices exactly, so the derived indices start at a recognizable, realistic
// magnitude before drifting with the simulated market.
const TICKER_BASELINES = { "eq-tech": 142.5, "eq-industrial": 88.3, "bond-sov": 101.2 };

function deriveGlobalIndices(instruments) {
  const byId = {};
  instruments.forEach(i => { byId[i.id] = i; });
  const out = [];

  const tech = byId["eq-tech"], indus = byId["eq-industrial"];
  if (tech && indus) {
    const baselineAvg = (TICKER_BASELINES["eq-tech"] + TICKER_BASELINES["eq-industrial"]) / 2;
    const currentAvg = (tech.price + indus.price) / 2;
    const spx = Math.round(5000 * (currentAvg / baselineAvg));
    out.push({ label: "S&P 500", value: spx.toLocaleString("en-US"), delta: currentAvg >= baselineAvg });
  }
  const fx = byId["fx-eurusd"];
  if (fx) {
    const rate = (fx.price / 100).toFixed(4);
    out.push({ label: "EUR/USD", value: rate, delta: fx.price >= 100 });
  }
  const bond = byId["bond-sov"];
  if (bond) {
    const yieldPct = (4.25 - (bond.price - TICKER_BASELINES["bond-sov"]) * 0.05).toFixed(2);
    out.push({ label: "US 10Y", value: yieldPct + "%", delta: bond.price <= TICKER_BASELINES["bond-sov"] });
  }
  const oil = byId["cmd-oil"];
  if (oil) {
    out.push({ label: "BRENT", value: "$" + oil.price.toFixed(2), delta: oil.price >= 76.4 });
  }
  return out;
}

function worldClockItems(now) {
  return TICKER_CLOCKS.map(c => {
    const time = new Intl.DateTimeFormat("fr-FR", { timeZone: c.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    return { label: c.label, value: time };
  });
}

let tickerClockInterval = null;

function renderGlobalTicker() {
  const el = document.getElementById("global-ticker");
  if (!el || !window.currentPlayer) return;

  const indices = deriveGlobalIndices(appState.publicTicker || []);
  const clocks = worldClockItems(Date.now());
  const items = [...indices, ...clocks];
  const itemHtml = items.map(it => `
    <span class="global-ticker-item">
      <span class="global-ticker-label">${it.label}</span>
      <span class="global-ticker-value ${it.delta === true ? "flash-up-static" : it.delta === false ? "flash-down-static" : ""}">${it.value}</span>
    </span>
  `).join("");

  el.innerHTML = `<div class="global-ticker-track">${itemHtml}${itemHtml}</div>`;

  // Refreshes the clocks (and re-derives the indices from whatever publicTicker
  // currently holds) every 30s -- cheap enough to just rebuild the whole strip
  // rather than patch individual clock nodes.
  if (!tickerClockInterval) {
    tickerClockInterval = setInterval(() => {
      if (!window.currentPlayer) return;
      renderGlobalTicker();
    }, 30000);
  }
}
