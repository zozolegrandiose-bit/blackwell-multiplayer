// Rival Banks — Aggressive Actions (Patch 21). Rival banks stop being mere
// league-table scores and become active threats along two axes the request
// names explicitly: poaching Blackwell's people when morale/pay is weak, and
// attacking a visible short position with a short squeeze. (The third axis,
// "Guerre des Mandats", is already fully covered by server/pitchbook.js —
// rival bids are seeded the instant a mandate opens, faster than the 30-60s
// asked for — so nothing new was needed there beyond broadening its flavor to
// also cover bond-issuance mandates, not just M&A.)
//
// Short-selling itself didn't exist in this game before this patch: a
// "position courte" needed a real short-sell mechanic to attack, not just
// flavor text, so server/handlers/markets.js's markets:buy now accepts an
// optional side ("long"/"short"), with markets:sell's P&L flipped accordingly.
const { pushActivity, postTeamChat, buildPublicRoster } = require("./gameState");
const { adjustSatisfaction } = require("./satisfaction");
const { computeBaseSalary } = require("./handlers/hr");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";

const SATISFACTION_POACH_THRESHOLD = 45;
const POACH_SWEEP_MIN_MS = 2 * 60 * 1000;
const POACH_SWEEP_MAX_MS = 4 * 60 * 1000;
const POACH_WINDOW_MS = 60 * 1000;
const POACH_RETENTION_RAISE_RATIO = 1.15;
const POACH_FAILED_SATISFACTION_PENALTY = -10;

const SHORT_SQUEEZE_MIN_MS = 25 * 1000;
const SHORT_SQUEEZE_MAX_MS = 45 * 1000;
const SHORT_POSITION_MIN_NOTIONAL = 150;
const SQUEEZE_PRICE_JUMP_MIN = 0.08;
const SQUEEZE_PRICE_JUMP_MAX = 0.15;

const AI_AGENT_REPLACEMENT_POOL = {
  TRADING: [{ name: "Sofia Marchetti", personality: "institutional" }, { name: "Tariq Haddad", personality: "cowboy" }],
  MA: [{ name: "Camille Girard", personality: "dealmaker" }, { name: "Ravi Chandrasekaran", personality: "institutional" }],
  RISK: [{ name: "Ingrid Solberg", personality: "institutional" }, { name: "Diego Fontaine", personality: "cowboy" }]
};

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}
function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}
function rivalBankNames(gameState) {
  return Object.keys(gameState.leagueTable).filter(name => name !== PLAYER_BANK_NAME);
}
function broadcastPoaching(io, gameState) {
  io.to("game").emit("rivalAggression:poachingUpdate", gameState.poachingAttempts);
}

// ---------- Poaching ----------
function averageConnectedSatisfaction(gameState) {
  const connected = gameState.players.filter(p => p.satisfaction != null);
  if (!connected.length) return 100; // nobody to poach, nothing to trigger on
  return connected.reduce((sum, p) => sum + p.satisfaction, 0) / connected.length;
}

function attemptPoach(io, gameState) {
  if (gameState.poachingAttempts.some(a => !a.resolved)) return; // one live attempt at a time
  if (averageConnectedSatisfaction(gameState) >= SATISFACTION_POACH_THRESHOLD) return;

  const humanCandidates = gameState.players.filter(p => p.satisfaction != null);
  const agentCandidates = gameState.aiAgents;
  const pool = [
    ...humanCandidates.map(p => ({ targetType: "player", targetId: p.id, targetName: p.fullName })),
    ...agentCandidates.map(a => ({ targetType: "agent", targetId: a.id, targetName: a.name }))
  ];
  if (!pool.length) return;
  const target = pool[Math.floor(Math.random() * pool.length)];
  const rivalBank = rivalBankNames(gameState)[Math.floor(Math.random() * rivalBankNames(gameState).length)];

  const attempt = {
    id: "poach" + Date.now(),
    targetType: target.targetType,
    targetId: target.targetId,
    targetName: target.targetName,
    rivalBank,
    deadline: Date.now() + POACH_WINDOW_MS,
    resolved: false
  };
  gameState.poachingAttempts.unshift(attempt);
  if (gameState.poachingAttempts.length > 20) gameState.poachingAttempts.length = 20;

  pushActivity(gameState, { actorPlayerId: null, page: "hr", text: "🎯 " + rivalBank + " tente de débaucher " + target.targetName + " — satisfaction moyenne trop basse chez Blackwell & Co." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  postTeamChat(gameState, {
    authorName: "IA — Ressources Humaines",
    text: "⚠️ " + rivalBank + " approche " + target.targetName + " avec une offre — la RH a 60 secondes pour contre-offrir avant qu'on ne le/la perde.",
    tone: "alert"
  });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  broadcastPoaching(io, gameState);
}

function replaceAgent(io, gameState, agent) {
  const pool = AI_AGENT_REPLACEMENT_POOL[agent.role] || [];
  const replacement = pool[Math.floor(Math.random() * pool.length)] || { name: "Nouveau/Nouvelle Collègue", personality: agent.personality };
  const oldName = agent.name;
  agent.name = replacement.name;
  agent.personality = replacement.personality;
  postTeamChat(gameState, {
    authorName: "IA — Ressources Humaines",
    text: "📤 " + oldName + " a rejoint un concurrent. " + replacement.name + " reprend le poste (" + agent.roleLabel + ").",
    tone: "alert"
  });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  io.to("game").emit("aiAgents:update", gameState.aiAgents);
}

function sweepPoachingExpiry(io, gameState) {
  const now = Date.now();
  gameState.poachingAttempts.forEach(attempt => {
    if (attempt.resolved || now < attempt.deadline) return;
    attempt.resolved = true;
    attempt.outcome = "lost";

    if (attempt.targetType === "player") {
      const player = gameState.players.find(p => p.id === attempt.targetId);
      if (player) adjustSatisfaction(io, gameState, player, POACH_FAILED_SATISFACTION_PENALTY);
      pushActivity(gameState, { actorPlayerId: null, page: "hr", text: "😟 " + attempt.targetName + " a failli partir chez " + attempt.rivalBank + " — resté(e), mais la confiance en a pris un coup." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
    } else {
      const agent = gameState.aiAgents.find(a => a.id === attempt.targetId);
      if (agent) replaceAgent(io, gameState, agent);
    }
    broadcastPoaching(io, gameState);
  });
}

function registerRivalAggressionHandlers(io, socket, gameState) {
  socket.on("hr:retainPoachingTarget", payload => {
    if (!requireAccess(socket, "hr")) return;
    const actor = gameState.players.find(p => p.id === socket.data.playerId);
    if (!actor) return;
    const attempt = gameState.poachingAttempts.find(a => a.id === payload.attemptId && !a.resolved);
    if (!attempt) return;

    attempt.resolved = true;
    attempt.outcome = "retained";

    if (attempt.targetType === "player") {
      const player = gameState.players.find(p => p.id === attempt.targetId);
      if (player) {
        const oldSalary = player.baseSalary;
        player.baseSalary = round1((player.baseSalary || computeBaseSalary(player.grade)) * POACH_RETENTION_RAISE_RATIO);
        adjustSatisfaction(io, gameState, player, 15);
        pushActivity(gameState, { actorPlayerId: actor.id, page: "hr", text: actor.fullName + " retient " + player.fullName + " avec une revalorisation (" + oldSalary + " → " + player.baseSalary + " M$/an) face à l'offre de " + attempt.rivalBank + "." });
        io.to("game").emit("activity:update", gameState.activityLog[0]);
      }
    } else {
      pushActivity(gameState, { actorPlayerId: actor.id, page: "hr", text: actor.fullName + " retient " + attempt.targetName + " face à l'approche de " + attempt.rivalBank + "." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
    }
    postTeamChat(gameState, { authorName: "IA — Ressources Humaines", text: "✅ " + attempt.targetName + " reste chez nous — belle réaction de la RH face à " + attempt.rivalBank + ".", tone: "congrats" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    broadcastPoaching(io, gameState);
  });
}

// ---------- Short Squeeze ----------
function attemptShortSqueeze(io, gameState) {
  const shorts = gameState.markets.positions.filter(p => p.side === "short" && Math.abs(p.notional) >= SHORT_POSITION_MIN_NOTIONAL);
  if (!shorts.length) return;
  const target = shorts.sort((a, b) => Math.abs(b.notional) - Math.abs(a.notional))[0];
  const instrument = gameState.markets.instruments.find(i => i.id === target.instrumentId);
  if (!instrument) return;
  const rivalBank = rivalBankNames(gameState)[Math.floor(Math.random() * rivalBankNames(gameState).length)];

  const jump = SQUEEZE_PRICE_JUMP_MIN + Math.random() * (SQUEEZE_PRICE_JUMP_MAX - SQUEEZE_PRICE_JUMP_MIN);
  const oldPrice = instrument.price;
  instrument.price = round2(instrument.price * (1 + jump));
  instrument.history.push(instrument.price);

  const priceMove = instrument.price / target.entryPrice - 1;
  const pnl = round2(target.notional * -priceMove); // short position, price rose -> real loss
  const markets = gameState.markets;
  markets.positions.splice(markets.positions.indexOf(target), 1);
  markets.cash = round2(markets.cash + target.notional + pnl);
  markets.realizedPnL = round2(markets.realizedPnL + pnl);
  markets.tradeLog.unshift({ instrumentName: instrument.name, notional: target.notional, pnl, closedByName: "Short Squeeze (" + rivalBank + ")", ts: Date.now() });
  if (markets.tradeLog.length > 30) markets.tradeLog.length = 30;

  pushActivity(gameState, { actorPlayerId: null, page: "markets", text: "🔥 " + rivalBank + " tente un Short Squeeze sur " + instrument.name + " — cours +" + round1(jump * 100) + "% (" + oldPrice + " → " + instrument.price + "), position courte de " + target.openedByName + " liquidée (" + pnl + " M$)." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  postTeamChat(gameState, { authorName: "IA — Salle des marchés", text: "🔥 Short Squeeze de " + rivalBank + " sur " + instrument.name + " — stops sautés, position liquidée à " + pnl + " M$.", tone: "alert" });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  io.to("access:markets").emit("markets:update", markets);
  io.to("game").emit("globalTicker:update", gameState.markets.instruments.map(i => ({ id: i.id, name: i.name, price: i.price, category: i.category })));
}

function startRivalAggressionLoops(io, gameState) {
  function poachTick() {
    if (!gameState.paused) attemptPoach(io, gameState);
    setTimeout(poachTick, randomDelay(POACH_SWEEP_MIN_MS, POACH_SWEEP_MAX_MS));
  }
  setTimeout(poachTick, randomDelay(POACH_SWEEP_MIN_MS, POACH_SWEEP_MAX_MS));

  function poachExpirySweepTick() {
    if (!gameState.paused) sweepPoachingExpiry(io, gameState);
    setTimeout(poachExpirySweepTick, 3000);
  }
  setTimeout(poachExpirySweepTick, 3000);

  function squeezeTick() {
    if (!gameState.paused) attemptShortSqueeze(io, gameState);
    setTimeout(squeezeTick, randomDelay(SHORT_SQUEEZE_MIN_MS, SHORT_SQUEEZE_MAX_MS));
  }
  setTimeout(squeezeTick, randomDelay(SHORT_SQUEEZE_MIN_MS, SHORT_SQUEEZE_MAX_MS));

  console.log("Agressivité des banques rivales activée (poaching, short squeeze).");
}

module.exports = {
  registerRivalAggressionHandlers, startRivalAggressionLoops,
  attemptPoach, sweepPoachingExpiry, attemptShortSqueeze, averageConnectedSatisfaction, replaceAgent,
  SATISFACTION_POACH_THRESHOLD, POACH_WINDOW_MS, SHORT_POSITION_MIN_NOTIONAL
};
