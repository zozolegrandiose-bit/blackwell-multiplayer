// Global Entities & Footprint -- turns Blackwell & Co Capital into a multi-region
// group with its own legal entities (JPMorgan-style structure, adapted with the
// game's own fictional brand rather than a real bank's actual legal entity names,
// consistent with how every other in-game institution is fictionalized).
//
// Adaptation note (honest, like server/negotiation.js's precedent): the user's
// request specified a TypeScript type file (`/src/types/globalBank.ts`) wired
// into a client-side "store". This project has no TypeScript build step, no
// `/src/` tree, and no client-side store abstraction -- the entire game already
// runs on one authoritative `gameState` object mutated on the server and
// broadcast over Socket.io (`server/gameState.js`), mirrored into a plain
// `appState` object client-side (`public/js/app.js`). That IS this game's
// "global store". The requested shape is reproduced below as plain JS + JSDoc
// typedefs (structurally identical fields, functionally real -- actually read,
// mutated and broadcast by the running server) rather than a `.ts` file that no
// build step would ever compile or execute.
//
// /**
//  * @typedef {'AMER'|'EMEA'|'APAC'|'LATAM'} RegionCode
//  * @typedef {Object} RegionalEntity
//  * @property {string} id
//  * @property {string} name
//  * @property {string} city
//  * @property {RegionCode} region
//  * @property {number} headcount
//  * @property {string} regulatoryBody
//  * @property {number} allocatedCapital
//  * @property {number} localPnL
//  * @property {('TRADING'|'MA'|'PRIVATE_BANKING'|'TREASURY'|'RISK'|'RH')[]} activeDesks
//  * @property {boolean} isMarketOpen
//  * @property {string} timezone
//  * @property {number} capitalRatioPct        -- extends the requested shape: the
//  *   free-text request also asks for a per-entity CET1 ratio, not just the
//  *   bank-wide one the TS type captures.
//  * @property {number} payrollCostM           -- extends the requested shape: the
//  *   free-text request also asks for a per-entity payroll cost figure.
//  * @typedef {Object} GlobalBankState
//  * @property {string} bankName
//  * @property {number} totalGlobalHeadcount
//  * @property {number} globalPnL
//  * @property {number} globalTier1CapitalRatio
//  * @property {RegionalEntity[]} entities
//  */
const { pushActivity, postTeamChat } = require("./gameState");
const { isHeadOfCIB } = require("./cibBonus");
const { GRADES } = require("./seedData");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";
const DIRECTOR_INDEX = GRADES.indexOf("Director");
const ACTIVE_DESK_TYPES = ["TRADING", "MA", "PRIVATE_BANKING", "TREASURY", "RISK", "RH"];
const CAPITAL_INJECTION_FACTOR = 0.1; // capital a deal's handling entity should hold, as a fraction of deal valuation
const SWEEP_MIN_MS = 8 * 1000;
const SWEEP_MAX_MS = 12 * 1000;

function round1(n) {
  return Math.round(n * 10) / 10;
}
function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

// "DRH Global" -- cluster F (RH & Communication), Director grade or above --
// mirrors isHeadOfCIB's exact shape (cluster + seniority gate) for the other
// role explicitly named in the request ("Head of CIB ou DRH Global").
function isDrhGlobal(player) {
  return !!player && player.cluster === "F" && GRADES.indexOf(player.grade) >= DIRECTOR_INDEX;
}

function canManageGlobalBank(player) {
  return !!player && (player.dept === "Board Of Directors" || isHeadOfCIB(player) || isDrhGlobal(player));
}

function seedGlobalBankEntities() {
  return [
    {
      id: "ny", name: "Blackwell & Co Capital, N.A.", city: "New York", region: "AMER",
      headcount: 145000, regulatoryBody: "FED / SEC", allocatedCapital: 4200, localPnL: 0,
      activeDesks: ["TRADING", "MA", "TREASURY", "RISK"], isMarketOpen: false,
      timezone: "America/New_York", capitalRatioPct: 15.2, payrollCostM: 2100
    },
    {
      id: "fra", name: "Blackwell & Co Europe SE", city: "Francfort", region: "EMEA",
      headcount: 62000, regulatoryBody: "BCE (ECB)", allocatedCapital: 1800, localPnL: 0,
      activeDesks: ["MA", "PRIVATE_BANKING", "RISK"], isMarketOpen: false,
      timezone: "Europe/Berlin", capitalRatioPct: 13.8, payrollCostM: 980
    },
    {
      id: "hk", name: "Blackwell & Co Securities Asia", city: "Hong Kong", region: "APAC",
      headcount: 38000, regulatoryBody: "SFC / MAS", allocatedCapital: 1200, localPnL: 0,
      activeDesks: ["TRADING", "PRIVATE_BANKING"], isMarketOpen: false,
      timezone: "Asia/Hong_Kong", capitalRatioPct: 14.6, payrollCostM: 640
    },
    {
      id: "ldn", name: "Blackwell & Co International Bank", city: "Londres", region: "EMEA",
      headcount: 54000, regulatoryBody: "FCA", allocatedCapital: 1500, localPnL: 0,
      activeDesks: ["TRADING", "TREASURY", "RH"], isMarketOpen: false,
      timezone: "Europe/London", capitalRatioPct: 14.1, payrollCostM: 860
    }
  ];
}

function seedGlobalBank() {
  const entities = seedGlobalBankEntities();
  return {
    bankName: PLAYER_BANK_NAME,
    totalGlobalHeadcount: entities.reduce((sum, e) => sum + e.headcount, 0),
    globalPnL: 0,
    globalTier1CapitalRatio: 14.5,
    entities
  };
}

// Pure, unit-testable: local business hours (9h-17h) at the entity's timezone,
// deliberately ignoring weekends for this fast-paced game.
function computeIsMarketOpen(entity, now) {
  const hourStr = new Intl.DateTimeFormat("en-US", { timeZone: entity.timezone, hour: "2-digit", hour12: false }).format(now);
  const hour = parseInt(hourStr, 10) % 24;
  return hour >= 9 && hour < 17;
}

function refreshMarketOpenFlags(gameState, now) {
  gameState.globalBank.entities.forEach(e => {
    e.isMarketOpen = computeIsMarketOpen(e, now || Date.now());
  });
}

// gameState.leagueTable already tracks Blackwell & Co's real P&L (server/gameState.js) --
// reused here rather than duplicated, same discipline as every other patch.
function syncGlobalPnl(gameState) {
  const entry = gameState.leagueTable[PLAYER_BANK_NAME];
  if (entry) gameState.globalBank.globalPnL = round1(entry.pnl);
}

function broadcastGlobalBank(io, gameState) {
  io.to("access:global").emit("globalBank:update", gameState.globalBank);
}

function registerGlobalBankHandlers(io, socket, gameState) {
  socket.on("globalBank:updateTotalHeadcount", payload => {
    if (!requireAccess(socket, "global")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    if (!canManageGlobalBank(actor)) return;
    const value = Number(payload.value);
    if (!Number.isFinite(value) || value < 0) return;

    gameState.globalBank.totalGlobalHeadcount = Math.round(value);
    pushActivity(gameState, { actorPlayerId: actor.id, page: "global", text: actor.fullName + " met à jour l'effectif mondial total à " + gameState.globalBank.totalGlobalHeadcount.toLocaleString("fr-FR") + " collaborateurs." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    broadcastGlobalBank(io, gameState);
  });

  socket.on("globalBank:updateEntity", payload => {
    if (!requireAccess(socket, "global")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    if (!canManageGlobalBank(actor)) return;
    const entity = gameState.globalBank.entities.find(e => e.id === payload.entityId);
    if (!entity) return;

    const field = payload.field;
    if (field === "headcount") {
      const v = Number(payload.value);
      if (!Number.isFinite(v) || v < 0) return;
      entity.headcount = Math.round(v);
    } else if (field === "regulatoryBody") {
      const v = (payload.value || "").toString().trim();
      if (!v) return;
      entity.regulatoryBody = v.slice(0, 60);
    } else if (field === "capitalRatioPct") {
      const v = Number(payload.value);
      if (!Number.isFinite(v) || v < 0 || v > 100) return;
      entity.capitalRatioPct = round1(v);
    } else if (field === "payrollCostM") {
      const v = Number(payload.value);
      if (!Number.isFinite(v) || v < 0) return;
      entity.payrollCostM = round1(v);
    } else if (field === "activeDesks") {
      if (!Array.isArray(payload.value)) return;
      const desks = payload.value.filter(d => ACTIVE_DESK_TYPES.includes(d));
      entity.activeDesks = desks;
    } else {
      return;
    }

    pushActivity(gameState, { actorPlayerId: actor.id, page: "global", text: actor.fullName + " met à jour " + entity.name + " (" + field + ")." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    broadcastGlobalBank(io, gameState);
  });

  // Overnight liquidity transfer -- capital arbitrage between regional entities.
  socket.on("globalBank:transferCapital", payload => {
    if (!requireAccess(socket, "global")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    if (!canManageGlobalBank(actor)) return;
    const from = gameState.globalBank.entities.find(e => e.id === payload.fromEntityId);
    const to = gameState.globalBank.entities.find(e => e.id === payload.toEntityId);
    const amount = Number(payload.amount);
    if (!from || !to || from.id === to.id || !Number.isFinite(amount) || amount <= 0) return;
    if (from.allocatedCapital < amount) return;

    from.allocatedCapital = round1(from.allocatedCapital - amount);
    to.allocatedCapital = round1(to.allocatedCapital + amount);

    pushActivity(gameState, {
      actorPlayerId: actor.id,
      page: "global",
      text: "🌐 " + actor.fullName + " transfère " + amount + " M$ de liquidité overnight de " + from.city + " vers " + to.city + "."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Trésorerie Groupe", text: "🌐 Transfert de liquidité inter-entités : " + from.city + " → " + to.city + " (" + amount + " M$).", tone: "congrats" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    broadcastGlobalBank(io, gameState);
  });
}

// Auto-injection: if a big M&A deal is pending execution and the entity handling
// EMEA deal flow (the Frankfurt hub) doesn't hold enough capital to back it, New
// York injects the shortfall automatically -- an observing sweep (like
// riskControl.js's Margin Call sweep) rather than a hook wired directly into
// server/handlers/dealWorkflow.js's already-tested execution path.
function sweepCapitalInjections(io, gameState) {
  const emea = gameState.globalBank.entities.find(e => e.id === "fra");
  const ny = gameState.globalBank.entities.find(e => e.id === "ny");
  if (!emea || !ny) return;

  gameState.maDeals.forEach(deal => {
    if (!deal.workflow || deal.workflow.phase !== "pending_execution") return;
    if (deal.valuation < 300) return;
    if (deal.globalCapitalInjected) return;

    const requiredCapital = round1(deal.valuation * CAPITAL_INJECTION_FACTOR);
    if (emea.allocatedCapital >= requiredCapital) return;

    const shortfall = round1(requiredCapital - emea.allocatedCapital);
    const injected = round1(Math.min(shortfall, Math.max(0, ny.allocatedCapital)));
    if (injected <= 0) return;

    ny.allocatedCapital = round1(ny.allocatedCapital - injected);
    emea.allocatedCapital = round1(emea.allocatedCapital + injected);
    deal.globalCapitalInjected = true;

    pushActivity(gameState, {
      actorPlayerId: null,
      page: "global",
      text: "🌐 « " + deal.name + " » (" + deal.valuation + " M$) : l'entité européenne manquait de fonds propres — New York injecte " + injected + " M$ via une transaction intra-groupe."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, { authorName: "IA — Trésorerie Groupe", text: "🌐 Injection de capital intra-groupe NY → Francfort (" + injected + " M$) pour couvrir « " + deal.name + " ».", tone: "alert" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    broadcastGlobalBank(io, gameState);
  });
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startGlobalBankLoop(io, gameState) {
  function sweepTick() {
    if (!gameState.paused) {
      refreshMarketOpenFlags(gameState);
      syncGlobalPnl(gameState);
      sweepCapitalInjections(io, gameState);
      broadcastGlobalBank(io, gameState);
    }
    setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(sweepTick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Global Entities & Footprint activé (4 entités régionales, transferts de liquidité overnight).");
}

module.exports = {
  registerGlobalBankHandlers, startGlobalBankLoop, seedGlobalBank, computeIsMarketOpen,
  refreshMarketOpenFlags, syncGlobalPnl, sweepCapitalInjections, isDrhGlobal, canManageGlobalBank,
  ACTIVE_DESK_TYPES, CAPITAL_INJECTION_FACTOR, PLAYER_BANK_NAME
};
