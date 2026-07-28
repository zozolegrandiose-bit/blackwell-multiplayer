// Négociation M&A -- this game only has one real playable bank (Blackwell), so a
// literal buyer-bank-vs-seller-bank negotiation between two player rosters isn't
// architecturally possible without a much bigger multi-tenant rework. Adapted
// honestly: Blackwell negotiates against an AI counterparty representing the
// other side, in a real 3-minute window with genuine back-and-forth convergence
// on price and a reps & warranties clause -- not just a single take-it-or-leave-it
// roll.
const { pushActivity, postTeamChat } = require("./gameState");
const { awardPoints } = require("./scoring");

const NEGOTIATION_WINDOW_MS = 3 * 60 * 1000;
const CLAUSES = ["Minimale", "Standard", "Renforcée"];
const ACCEPT_TOLERANCE_PCT = 3; // AI accepts once the gap to its current ask is this tight
const AI_CONVERGENCE_RATIO = 0.5; // AI moves half the remaining gap toward the player's last offer each round

function round1(n) {
  return Math.round(n * 10) / 10;
}
function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function registerNegotiationHandlers(io, socket, gameState) {
  socket.on("ma:openNegotiation", payload => {
    if (!requireAccess(socket, "ma")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!player || !deal || deal.negotiation || deal.stage !== "Négociation") return;

    const openingAsk = round1(deal.valuation * (1.1 + Math.random() * 0.1));
    deal.negotiation = {
      active: true,
      deadline: Date.now() + NEGOTIATION_WINDOW_MS,
      counterpartyAsk: openingAsk,
      lastOurOffer: null,
      round: 0,
      clause: null,
      messages: [{ from: "counterparty", text: "Nous demandons " + openingAsk + " M$ pour la cible.", ts: Date.now() }],
      agreedPrice: null
    };
    pushActivity(gameState, { actorPlayerId: player.id, page: "ma", text: player.fullName + " ouvre le canal de négociation pour « " + deal.name + " » — 3 minutes pour s'accorder sur le prix." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:ma").emit("ma:update", gameState.maDeals);
  });

  socket.on("ma:submitNegotiationOffer", payload => {
    if (!requireAccess(socket, "ma")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!player || !deal || !deal.negotiation || !deal.negotiation.active) return;
    if (Date.now() >= deal.negotiation.deadline) return;
    const offer = Number(payload.offerPrice);
    if (!Number.isFinite(offer) || offer <= 0) return;
    if (payload.clause && CLAUSES.includes(payload.clause)) deal.negotiation.clause = payload.clause;

    const neg = deal.negotiation;
    neg.round += 1;
    neg.lastOurOffer = offer;
    neg.messages.push({ from: "us", text: player.fullName + " propose " + offer + " M$" + (neg.clause ? " (clause " + neg.clause + ")" : ""), ts: Date.now() });

    const gapPct = Math.abs(neg.counterpartyAsk - offer) / neg.counterpartyAsk * 100;
    if (gapPct <= ACCEPT_TOLERANCE_PCT || offer >= neg.counterpartyAsk) {
      neg.active = false;
      neg.agreedPrice = round1((neg.counterpartyAsk + offer) / 2);
      deal.valuation = neg.agreedPrice;
      neg.messages.push({ from: "counterparty", text: "Accord trouvé à " + neg.agreedPrice + " M$.", ts: Date.now() });
      awardPoints(io, gameState, player, "ma_create");
      pushActivity(gameState, { actorPlayerId: player.id, page: "ma", text: "🤝 Accord de négociation trouvé sur « " + deal.name + " » : " + neg.agreedPrice + " M$ (clause " + (neg.clause || "Standard") + ")." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      postTeamChat(gameState, { authorName: "IA — M&A", text: "🤝 Négociation conclue sur « " + deal.name + " » à " + neg.agreedPrice + " M$.", tone: "congrats" });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    } else {
      const newAsk = round1(neg.counterpartyAsk - (neg.counterpartyAsk - offer) * AI_CONVERGENCE_RATIO);
      neg.counterpartyAsk = newAsk;
      neg.messages.push({ from: "counterparty", text: "Contre-proposition à " + newAsk + " M$.", ts: Date.now() });
      pushActivity(gameState, { actorPlayerId: player.id, page: "ma", text: player.fullName + " négocie « " + deal.name + " » — contrepartie recontre à " + newAsk + " M$." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
    }

    io.to("access:ma").emit("ma:update", gameState.maDeals);
  });
}

function sweepNegotiations(io, gameState) {
  const now = Date.now();
  gameState.maDeals.forEach(deal => {
    if (!deal.negotiation || !deal.negotiation.active || now < deal.negotiation.deadline) return;
    deal.negotiation.active = false;
    pushActivity(gameState, { actorPlayerId: null, page: "ma", text: "⌛ Négociation sur « " + deal.name + " » close sans accord — les parties restent sur leurs positions." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:ma").emit("ma:update", gameState.maDeals);
  });
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startNegotiationLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepNegotiations(io, gameState);
    setTimeout(tick, randomDelay(5000, 8000));
  }
  setTimeout(tick, randomDelay(5000, 8000));
}

module.exports = { registerNegotiationHandlers, startNegotiationLoop, sweepNegotiations, NEGOTIATION_WINDOW_MS, CLAUSES, ACCEPT_TOLERANCE_PCT };
