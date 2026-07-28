// Mercato Inter-Banques — HR / Director-and-above players can see rival banks'
// NPC talent (gameState.rivalTalent, seeded in gameState.js) and try to poach one
// with a better salary.
//
// HR-2 (loyauté + contre-offre): a loyal target (loyalty >= LOYALTY_THRESHOLD)
// still resolves immediately via the original Patch 15 probabilistic roll
// (weighted by salary uplift) -- a hard sell either way. A disloyal target
// (loyalty < 40) instead near-accepts on the spot, opening a 60s window during
// which their origin bank can counter-offer and keep them; only after that
// window (via this file's own sweep loop) does the move actually land.
const { pushActivity, postTeamChat } = require("./gameState");
const { awardPoints } = require("./scoring");
const { adjustMorale } = require("./handlers/hr");

const MIN_UPLIFT_RATIO = 1.01; // must beat the NPC's current salary, even if barely
const MAX_UPLIFT_RATIO = 3;    // guards against absurd client-supplied offers
const LOYALTY_THRESHOLD = 40;
const COUNTER_WINDOW_MS = 60 * 1000;
const COUNTER_SUCCESS_PROBABILITY = 0.5;
const COUNTER_RAISE_MIN_RATIO = 1.1;
const COUNTER_RAISE_MAX_RATIO = 1.3;
const SWEEP_MIN_MS = 3 * 1000;
const SWEEP_MAX_MS = 5 * 1000;

function requireMercatoAccess(socket) {
  return socket.rooms.has("access:hr") || socket.rooms.has("access:strategy");
}

function findRivalTalent(gameState, bankName, npcId) {
  const roster = gameState.rivalTalent[bankName];
  if (!roster) return null;
  const npc = roster.find(n => n.id === npcId);
  if (!npc) return null;
  return { roster, npc };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function logOffer(gameState, offer) {
  gameState.mercatoOffers.unshift(offer);
  if (gameState.mercatoOffers.length > 50) gameState.mercatoOffers.length = 50;
}

function broadcastMercato(io, gameState) {
  io.to("access:hr").to("access:strategy").emit("mercato:update", { rivalTalent: gameState.rivalTalent, mercatoOffers: gameState.mercatoOffers, hr: gameState.hr });
}

function completePoach(io, gameState, bankName, roster, npc, byPlayer, salary) {
  roster.splice(roster.indexOf(npc), 1);
  gameState.hr.headcountNPC += 1;
  adjustMorale(gameState, 3);
  if (byPlayer) awardPoints(io, gameState, byPlayer, "mercato_offerAccepted");
  pushActivity(gameState, { actorPlayerId: byPlayer ? byPlayer.id : null, page: "hr", text: (byPlayer ? byPlayer.fullName : "L'équipe RH") + " a débauché " + npc.name + " (" + npc.role + ") de " + bankName + " pour " + salary + " M$." });
  postTeamChat(gameState, {
    authorName: "IA — Ressources Humaines",
    text: "🤝 Coup de mercato : " + npc.name + " (" + bankName + ") rejoint nos équipes" + (byPlayer ? ", débauché par " + byPlayer.fullName + "." : "."),
    tone: "congrats"
  });
  io.to("game").emit("teamChat:update", gameState.teamChat[0]);
}

function registerMercatoHandlers(io, socket, gameState) {
  socket.on("mercato:makeOffer", payload => {
    if (!requireMercatoAccess(socket)) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;

    const { bankName, npcId, offeredSalary } = payload || {};
    const found = findRivalTalent(gameState, bankName, npcId);
    if (!found) {
      socket.emit("mercato:offerRejected", { reason: "Ce talent n'est plus disponible sur le marché." });
      return;
    }
    const { roster, npc } = found;
    if (npc.pendingOffer) {
      socket.emit("mercato:offerRejected", { reason: "Une contre-offre est déjà en cours pour ce talent." });
      return;
    }
    const salary = Number(offeredSalary);
    if (!Number.isFinite(salary) || salary < npc.currentSalary * MIN_UPLIFT_RATIO || salary > npc.currentSalary * MAX_UPLIFT_RATIO) {
      socket.emit("mercato:offerRejected", { reason: "L'offre doit être supérieure au salaire actuel (et rester raisonnable)." });
      return;
    }

    const loyalty = npc.loyalty == null ? 60 : npc.loyalty;

    if (loyalty < LOYALTY_THRESHOLD) {
      npc.pendingOffer = {
        offeredSalary: salary,
        byPlayerId: player.id,
        byName: player.fullName,
        deadline: Date.now() + COUNTER_WINDOW_MS
      };
      pushActivity(gameState, { actorPlayerId: player.id, page: "hr", text: player.fullName + " propose " + salary + " M$ à " + npc.name + " (" + bankName + ", loyauté faible) — la banque d'origine a 60 secondes pour contre-attaquer." });
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      broadcastMercato(io, gameState);
      return;
    }

    const upliftRatio = (salary - npc.currentSalary) / npc.currentSalary;
    const successChance = Math.max(0.15, Math.min(0.85, 0.2 + upliftRatio * 0.6));
    const success = Math.random() < successChance;

    logOffer(gameState, {
      id: "mo" + Date.now() + Math.round(Math.random() * 1000),
      bankName, npcName: npc.name, npcRole: npc.role, currentSalary: npc.currentSalary,
      offeredSalary: salary, success, byPlayerId: player.id, byName: player.fullName, ts: Date.now()
    });

    if (success) {
      completePoach(io, gameState, bankName, roster, npc, player, salary);
    } else {
      pushActivity(gameState, { actorPlayerId: player.id, page: "hr", text: player.fullName + " a tenté de débaucher " + npc.name + " (" + bankName + ") — offre déclinée." });
    }

    io.to("game").emit("activity:update", gameState.activityLog[0]);
    broadcastMercato(io, gameState);
  });
}

// Resolves every NPC whose 60s counter-offer window has elapsed -- the origin
// bank's counter succeeds with a flat probability (a raise, flavor-only on their
// side); otherwise the move to Blackwell completes, crediting the player who
// made the original offer.
function sweepMercatoCounters(io, gameState) {
  const now = Date.now();
  Object.keys(gameState.rivalTalent).forEach(bankName => {
    const roster = gameState.rivalTalent[bankName];
    roster.slice().forEach(npc => {
      if (!npc.pendingOffer || now < npc.pendingOffer.deadline) return;
      const { offeredSalary, byPlayerId, byName } = npc.pendingOffer;
      const countered = Math.random() < COUNTER_SUCCESS_PROBABILITY;
      const byPlayer = gameState.players.find(p => p.id === byPlayerId) || null;

      if (countered) {
        const raiseRatio = COUNTER_RAISE_MIN_RATIO + Math.random() * (COUNTER_RAISE_MAX_RATIO - COUNTER_RAISE_MIN_RATIO);
        npc.currentSalary = round1(npc.currentSalary * raiseRatio);
        npc.loyalty = Math.min(100, (npc.loyalty || 60) + 10);
        delete npc.pendingOffer;
        logOffer(gameState, { id: "mo" + Date.now() + Math.round(Math.random() * 1000), bankName, npcName: npc.name, npcRole: npc.role, currentSalary: npc.currentSalary, offeredSalary, success: false, byPlayerId, byName, ts: Date.now(), countered: true });
        pushActivity(gameState, { actorPlayerId: null, page: "hr", text: bankName + " contre-attaque et retient " + npc.name + " avec une revalorisation à " + npc.currentSalary + " M$." });
      } else {
        delete npc.pendingOffer;
        logOffer(gameState, { id: "mo" + Date.now() + Math.round(Math.random() * 1000), bankName, npcName: npc.name, npcRole: npc.role, currentSalary: npc.currentSalary, offeredSalary, success: true, byPlayerId, byName, ts: Date.now() });
        completePoach(io, gameState, bankName, roster, npc, byPlayer, offeredSalary);
      }
      io.to("game").emit("activity:update", gameState.activityLog[0]);
      broadcastMercato(io, gameState);
    });
  });
}

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

function startMercatoLoop(io, gameState) {
  function tick() {
    if (!gameState.paused) sweepMercatoCounters(io, gameState);
    setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  }
  setTimeout(tick, randomDelay(SWEEP_MIN_MS, SWEEP_MAX_MS));
  console.log("Mercato inter-banques activé (contre-offres sous 60s pour les talents peu loyaux).");
}

module.exports = { registerMercatoHandlers, startMercatoLoop, sweepMercatoCounters, MIN_UPLIFT_RATIO, MAX_UPLIFT_RATIO, LOYALTY_THRESHOLD, COUNTER_WINDOW_MS, COUNTER_SUCCESS_PROBABILITY };
