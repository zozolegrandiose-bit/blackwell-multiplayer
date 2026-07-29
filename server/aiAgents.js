// AI Agents — Heartbeat, Personality & Chat (Patch 20). The user's core complaint
// was "les IA sont trop passives" -- server/ai.js's existing ambient AI only acts
// when a page is completely unstaffed (a fallback, not a presence). This module
// adds a small roster of NAMED AI colleagues who act as parallel teammates
// regardless of whether a human is also on their desk: each has its own
// independent, self-rescheduling "heartbeat" (5-15s, no setInterval, same
// convention as every other loop in this game), a personality archetype that
// biases its risk-taking/speed, and the ability to post -- and reply to --
// messages in the team chat, so their work is actually visible.
//
// Deliberately reuses existing extracted actions wherever one already exists
// (respondToRfq, advanceRandomDeal, progressRandomComplianceItem, computeVaR)
// rather than re-deriving trading/deal/compliance logic a second time.
const { pushActivity, postTeamChat } = require("./gameState");
const { respondToRfq } = require("./rfq");
const { advanceRandomDeal } = require("./handlers/ma");
const { progressRandomComplianceItem } = require("./handlers/compliance");
const { computeVaR, varStatus, PLAYER_VAR_CRITICAL } = require("./riskControl");
const { MIN_COMMISSION_PCT, MAX_COMMISSION_PCT, creditRatingToCredibility } = require("./pitchbook");
const { EXECUTION_WINDOW_MS } = require("./handlers/dealWorkflow");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";

// Nudge a slow-to-decide human Risk Manager at 15s, force the call at 30s. This
// only ever meaningfully fires while a human IS connected to Compliance: when
// nobody is, server/handlers/dealWorkflow.js's own aiReviewPendingRisk already
// resolves pending_risk within ~2s (room.size === 0 guard), so it always wins
// that race first -- the two systems partition cleanly by human presence
// without needing to coordinate directly.
const RISK_NUDGE_MS = 15 * 1000;
const RISK_FORCE_DECISION_MS = 30 * 1000;

const HEARTBEAT_MIN_MS = 5 * 1000;
const HEARTBEAT_MAX_MS = 15 * 1000;
const CHAT_MENTION_REPLY_MIN_MS = 2 * 1000;
const CHAT_MENTION_REPLY_MAX_MS = 6 * 1000;

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}
function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}
function firstNameOf(fullName) {
  return (fullName || "").split(" ")[0];
}

// Personality archetypes -- bias risk-taking, speed and (for the Trader) how
// tight a spread the agent is willing to quote. Not just flavor text: cowboy's
// wider spreadTolerance genuinely means it sometimes quotes outside the 3%
// acceptance band it was aiming to land inside (a real risk-of-error, not
// scripted), and its shorter heartbeat delay makes it visibly faster/more active.
const PERSONALITIES = {
  cowboy: {
    key: "cowboy", label: "The Cowboy", emoji: "🤠",
    description: "Agressif — prend d'immenses risques en trading, réclame de gros bonus, très rapide mais commet parfois des erreurs de risque.",
    speedFactor: 0.65, spreadTolerance: 0.045, positionSizeRange: [50, 140], shortBias: 0.4
  },
  institutional: {
    key: "institutional", label: "The Institutional", emoji: "🏛",
    description: "Conservateur — très prudent sur le risque, valide lentement mais évite les pertes majeures.",
    speedFactor: 1.35, spreadTolerance: 0.018, positionSizeRange: [10, 35], shortBias: 0.1
  },
  dealmaker: {
    key: "dealmaker", label: "The Dealmaker", emoji: "🤝",
    description: "Charismatique — excellent en origination M&A pour faire signer les clients, mais exige un salaire élevé.",
    speedFactor: 0.9, spreadTolerance: 0.025, positionSizeRange: [20, 60], shortBias: 0.2
  }
};

// A small, fixed roster rather than one agent per vacant desk -- exactly the 3
// roles the request enumerates for the heartbeat, one clean example of each
// personality archetype so the org chart reads unambiguously.
const AI_AGENTS_SEED = [
  { id: "agent-trader-1", name: "Marcus Chen", role: "TRADING", roleLabel: "Trader IA", personality: "cowboy" },
  { id: "agent-ma-1", name: "Julien Beaumont", role: "MA", roleLabel: "Analyste M&A IA", personality: "dealmaker" },
  { id: "agent-risk-1", name: "Elena Kowalski", role: "RISK", roleLabel: "Risk Manager IA", personality: "institutional" }
];

function seedAiAgents() {
  return AI_AGENTS_SEED.map(a => ({ ...a }));
}

function personalityOf(agent) {
  return PERSONALITIES[agent.personality];
}

// Every heartbeat action is attributed to a real, named synthetic actor (id:
// null, like every other AI actor in this game) so pushActivity/postTeamChat
// read as "Marcus Chen a fait X" rather than an anonymous system line.
function actorForAgent(agent) {
  return { id: null, fullName: agent.name + " (" + agent.roleLabel + ")" };
}

function chatAuthorForAgent(agent) {
  const p = personalityOf(agent);
  return p.emoji + " " + agent.name + " — " + agent.roleLabel;
}

// ---------- Trader IA heartbeat ----------
function traderHeartbeatTick(io, gameState, agent) {
  const actor = actorForAgent(agent);
  const personality = personalityOf(agent);

  const liveRfq = gameState.rfqRequests.find(r => !r.resolved && Date.now() < r.deadline);
  if (liveRfq) {
    // Cowboy quotes tight-and-fast (more upside, real chance of missing the 3%
    // band); institutional quotes safely inside it almost every time.
    const spread = (Math.random() * personality.spreadTolerance);
    const direction = Math.random() < 0.5 ? 1 : -1;
    const quotedPrice = round2(liveRfq.referencePrice * (1 + direction * spread));
    const resolved = respondToRfq(io, gameState, liveRfq, quotedPrice, actor);
    if (resolved && resolved.accepted && Math.random() < 0.5) {
      postTeamChat(gameState, {
        authorName: chatAuthorForAgent(agent),
        text: "📞 RFQ de " + resolved.clientName + " sécurisé sur " + resolved.instrumentName + " — belle exécution.",
        tone: "congrats"
      });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    }
    return;
  }

  const unhedged = gameState.pendingHedges.find(h => !h.hedged);
  if (unhedged) {
    unhedged.hedged = true;
    pushActivity(gameState, { actorPlayerId: null, page: "markets", text: actor.fullName + " couvre le delta du " + unhedged.structureType + " (" + unhedged.clientName + ") sur le marché spot — exposition neutralisée." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:markets").emit("structuredProducts:update", { hedgingRequests: gameState.hedgingRequests, structuredProducts: gameState.structuredProducts, pendingHedges: gameState.pendingHedges });
    return;
  }

  // Ambient small trade, personality-scaled size, only when the desk is open for business.
  if (gameState.repoStatus.blocked) return;
  const markets = gameState.markets;
  if (!markets.instruments.length || Math.random() < 0.5) return;
  const [minSize, maxSize] = personality.positionSizeRange;
  const notional = Math.round((minSize + Math.random() * (maxSize - minSize)) / 5) * 5;
  if (notional > markets.cash) return;
  const instrument = markets.instruments[Math.floor(Math.random() * markets.instruments.length)];
  const side = Math.random() < personality.shortBias ? "short" : "long";
  markets.cash = round2(markets.cash - notional);
  markets.positions.push({
    id: "pos-ai-" + Date.now() + Math.round(Math.random() * 1000),
    instrumentId: instrument.id, notional, side, entryPrice: instrument.price,
    openedByPlayerId: null, openedByName: actor.fullName, openedAt: Date.now()
  });
  pushActivity(gameState, { actorPlayerId: null, page: "markets", text: actor.fullName + " ouvre une position " + (side === "short" ? "courte" : "longue") + " de " + notional + " M$ sur " + instrument.name + "." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("access:markets").emit("markets:update", markets);
}

// ---------- M&A Analyst IA heartbeat ----------
function submitAiPitchbookBid(io, gameState, agent) {
  const competition = gameState.pitchbookCompetitions.find(c => !c.resolved && Date.now() < c.deadline && !c.bids.some(b => b.bankName === PLAYER_BANK_NAME));
  if (!competition) return false;
  const commissionRate = round2(MIN_COMMISSION_PCT + Math.random() * (MAX_COMMISSION_PCT - MIN_COMMISSION_PCT));
  const bid = {
    bankName: PLAYER_BANK_NAME, commissionRate,
    credibilityScore: creditRatingToCredibility(gameState, PLAYER_BANK_NAME),
    byPlayerId: null, byName: agent.name + " (" + agent.roleLabel + ")"
  };
  competition.bids.push(bid);
  pushActivity(gameState, { actorPlayerId: null, page: "ma", text: agent.name + " soumet une offre à " + competition.clientName + " (commission " + commissionRate + "%)." });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  io.to("access:ma").emit("pitchbook:update", gameState.pitchbookCompetitions);
  return true;
}

function maHeartbeatTick(io, gameState, agent) {
  const actor = actorForAgent(agent);

  if (submitAiPitchbookBid(io, gameState, agent)) return;

  const bankEntryBefore = gameState.leagueTable[PLAYER_BANK_NAME];
  const pnlBefore = bankEntryBefore ? bankEntryBefore.pnl : 0;
  const closedIdsBefore = new Set(gameState.maDeals.filter(d => d.stage === "Clôturé").map(d => d.id));

  const acted = advanceRandomDeal(io, gameState, actor);
  if (!acted) return;

  const newlyClosed = gameState.maDeals.find(d => d.stage === "Clôturé" && !closedIdsBefore.has(d.id));
  if (newlyClosed) {
    const bankEntryAfter = gameState.leagueTable[PLAYER_BANK_NAME];
    const profit = round1((bankEntryAfter ? bankEntryAfter.pnl : pnlBefore) - pnlBefore);
    postTeamChat(gameState, {
      authorName: chatAuthorForAgent(agent),
      text: "Le mandat pour « " + newlyClosed.name + " » est sécurisé ! P&L " + (profit >= 0 ? "+" : "") + profit + "M$.",
      tone: "congrats"
    });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  }
}

// ---------- Risk Manager IA heartbeat ----------
function riskHeartbeatTick(io, gameState, agent) {
  const actor = actorForAgent(agent);
  const now = Date.now();

  const pendingDeal = gameState.maDeals.find(d => d.workflow && d.workflow.phase === "pending_risk");
  if (pendingDeal) {
    const elapsed = now - pendingDeal.workflow.submittedAt;
    if (elapsed >= RISK_FORCE_DECISION_MS) {
      const rate = pendingDeal.workflow.rate;
      pendingDeal.workflow.phase = "pending_execution";
      pendingDeal.workflow.riskDecisionByPlayerId = null;
      pendingDeal.workflow.riskDecisionByName = agent.name + " (" + agent.roleLabel + ")";
      pendingDeal.workflow.riskDecisionAt = now;
      pendingDeal.workflow.executionDeadline = now + EXECUTION_WINDOW_MS;
      ["ma", "compliance", "markets"].forEach(page => io.to("access:" + page).emit("ma:update", gameState.maDeals));
      io.to("access:markets").emit("dealWorkflow:notify", { type: "execution_pending", dealId: pendingDeal.id, text: agent.name + " a validé « " + pendingDeal.name + " » (taux " + rate + " %) faute de décision humaine sous 30s — exécution requise sous 2 minutes." });
      pushActivity(gameState, { actorPlayerId: null, page: "compliance", text: actor.fullName + " valide « " + pendingDeal.name + " » — le Risk Manager humain n'a pas tranché à temps." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      postTeamChat(gameState, { authorName: chatAuthorForAgent(agent), text: "J'ai validé « " + pendingDeal.name + " » moi-même — ça traînait depuis 30 secondes.", tone: "alert" });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    } else if (elapsed >= RISK_NUDGE_MS && !pendingDeal.workflow.aiNudgedAt) {
      pendingDeal.workflow.aiNudgedAt = now;
      const submitterFirstName = firstNameOf(pendingDeal.workflow.submittedByName);
      postTeamChat(gameState, { authorName: chatAuthorForAgent(agent), text: "Hey " + submitterFirstName + ", tu as jeté un œil au deal « " + pendingDeal.name + " » ? Le client attend.", tone: "alert" });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    }
    return;
  }

  const { perPlayer } = computeVaR(gameState);
  const critical = perPlayer.find(p => varStatus(p.var) === "critical");
  if (critical) {
    const worstPosition = gameState.markets.positions
      .filter(p => p.openedByPlayerId === critical.playerId)
      .sort((a, b) => Math.abs(b.notional) - Math.abs(a.notional))[0];
    const instrument = worstPosition && gameState.markets.instruments.find(i => i.id === worstPosition.instrumentId);
    const targetFirstName = firstNameOf(critical.playerName);
    const instrumentText = instrument ? instrument.name : "votre book";
    postTeamChat(gameState, {
      authorName: chatAuthorForAgent(agent),
      text: "@" + targetFirstName + " : votre position sur " + instrumentText + " est hors limite, couvrez-la sous 30s ou je liquide !",
      tone: "alert"
    });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    return;
  }

  progressRandomComplianceItem(io, gameState, actor);
}

const HEARTBEAT_TICKS = { TRADING: traderHeartbeatTick, MA: maHeartbeatTick, RISK: riskHeartbeatTick };

function startAiAgentsHeartbeat(io, gameState) {
  gameState.aiAgents.forEach(agent => {
    const personality = personalityOf(agent);
    const tickFn = HEARTBEAT_TICKS[agent.role];
    if (!tickFn) return;
    function tick() {
      if (!gameState.paused) tickFn(io, gameState, agent);
      setTimeout(tick, randomDelay(HEARTBEAT_MIN_MS, HEARTBEAT_MAX_MS) * personality.speedFactor);
    }
    setTimeout(tick, randomDelay(HEARTBEAT_MIN_MS, HEARTBEAT_MAX_MS) * personality.speedFactor);
  });
  console.log("Heartbeat IA activé (" + gameState.aiAgents.length + " agents, 5-15s selon personnalité).");
}

// ---------- Chat: players can now post to the News feed, and mentioning an
// agent (by first name or role tag) gets a short, in-character reply. ----------
const MENTION_ROLE_TAGS = { TRADING: ["trading", "marchés", "marches"], MA: ["ma", "m&a", "m&amp;a"], RISK: ["risk", "compliance", "conformité", "conformite"] };

function agentMentioned(agent, lowerBody) {
  const firstName = firstNameOf(agent.name).toLowerCase();
  if (lowerBody.includes("@" + firstName) || lowerBody.includes("@" + agent.name.toLowerCase())) return true;
  return (MENTION_ROLE_TAGS[agent.role] || []).some(tag => lowerBody.includes("@" + tag));
}

function replyTemplateFor(agent, gameState) {
  if (agent.role === "TRADING") {
    const openPositions = gameState.markets.positions.length;
    return [
      "Je surveille le book, " + openPositions + " position(s) ouverte(s) en ce moment.",
      "Ça bouge sur les marchés, je reste dessus.",
      "RAS de mon côté, prêt à coter si un RFQ arrive."
    ];
  }
  if (agent.role === "MA") {
    const openDeals = gameState.maDeals.filter(d => d.stage !== "Clôturé").length;
    return [
      "J'ai " + openDeals + " dossier(s) M&A en cours, ça avance.",
      "Toujours en train de chasser le prochain mandat.",
      "Je regarde ça et je reviens vers toi."
    ];
  }
  const { bankTotal } = computeVaR(gameState);
  return [
    "VaR du book actuellement à " + bankTotal + " M$ — sous contrôle pour l'instant.",
    "Je garde un œil sur les positions ouvertes, tout est dans les clous.",
    "Envoie-moi le dossier si besoin d'une validation rapide."
  ];
}

function scanForMentions(io, gameState, body) {
  const lowerBody = body.toLowerCase();
  gameState.aiAgents.forEach(agent => {
    if (!agentMentioned(agent, lowerBody)) return;
    setTimeout(() => {
      if (gameState.paused) return;
      const templates = replyTemplateFor(agent, gameState);
      const text = templates[Math.floor(Math.random() * templates.length)];
      postTeamChat(gameState, { authorName: chatAuthorForAgent(agent), text, tone: "ai-reply" });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    }, randomDelay(CHAT_MENTION_REPLY_MIN_MS, CHAT_MENTION_REPLY_MAX_MS));
  });
}

function registerAiAgentsHandlers(io, socket, gameState) {
  socket.on("teamChat:post", payload => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const body = (payload.body || "").trim().slice(0, 240);
    if (!body) return;

    postTeamChat(gameState, { authorName: player.fullName, text: body, tone: "player" });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    scanForMentions(io, gameState, body);
  });
}

module.exports = {
  registerAiAgentsHandlers, startAiAgentsHeartbeat, seedAiAgents,
  traderHeartbeatTick, maHeartbeatTick, riskHeartbeatTick, submitAiPitchbookBid,
  agentMentioned, scanForMentions, replyTemplateFor,
  PERSONALITIES, AI_AGENTS_SEED, RISK_NUDGE_MS, RISK_FORCE_DECISION_MS
};
