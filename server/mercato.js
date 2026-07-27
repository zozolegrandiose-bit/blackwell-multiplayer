// Mercato Inter-Banques — HR / Director-and-above players can see rival banks'
// NPC talent (gameState.rivalTalent, seeded in gameState.js) and try to poach one
// with a better salary. Resolved immediately (probabilistic, weighted by how much
// of a raise is offered) rather than as a slow negotiation, to keep this mechanic
// testable and self-contained within one patch alongside four other systems.
const { pushActivity, postTeamChat } = require("./gameState");
const { awardPoints } = require("./scoring");
const { adjustMorale } = require("./handlers/hr");

const MIN_UPLIFT_RATIO = 1.01; // must beat the NPC's current salary, even if barely
const MAX_UPLIFT_RATIO = 3;    // guards against absurd client-supplied offers

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
    const salary = Number(offeredSalary);
    if (!Number.isFinite(salary) || salary < npc.currentSalary * MIN_UPLIFT_RATIO || salary > npc.currentSalary * MAX_UPLIFT_RATIO) {
      socket.emit("mercato:offerRejected", { reason: "L'offre doit être supérieure au salaire actuel (et rester raisonnable)." });
      return;
    }

    const upliftRatio = (salary - npc.currentSalary) / npc.currentSalary;
    const successChance = Math.max(0.15, Math.min(0.85, 0.2 + upliftRatio * 0.6));
    const success = Math.random() < successChance;

    const offer = {
      id: "mo" + Date.now() + Math.round(Math.random() * 1000),
      bankName,
      npcName: npc.name,
      npcRole: npc.role,
      currentSalary: npc.currentSalary,
      offeredSalary: salary,
      success,
      byPlayerId: player.id,
      byName: player.fullName,
      ts: Date.now()
    };
    gameState.mercatoOffers.unshift(offer);
    if (gameState.mercatoOffers.length > 50) gameState.mercatoOffers.length = 50;

    if (success) {
      roster.splice(roster.indexOf(npc), 1);
      gameState.hr.headcountNPC += 1;
      adjustMorale(gameState, 3);
      awardPoints(io, gameState, player, "mercato_offerAccepted");
      pushActivity(gameState, { actorPlayerId: player.id, page: "hr", text: player.fullName + " a débauché " + npc.name + " (" + npc.role + ") de " + bankName + " pour " + salary + " M$." });
      postTeamChat(gameState, {
        authorName: "IA — Ressources Humaines",
        text: "🤝 Coup de mercato : " + npc.name + " (" + bankName + ") rejoint nos équipes, débauché par " + player.fullName + ".",
        tone: "congrats"
      });
      io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    } else {
      pushActivity(gameState, { actorPlayerId: player.id, page: "hr", text: player.fullName + " a tenté de débaucher " + npc.name + " (" + bankName + ") — offre déclinée." });
    }

    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:hr").to("access:strategy").emit("mercato:update", { rivalTalent: gameState.rivalTalent, mercatoOffers: gameState.mercatoOffers, hr: gameState.hr });
  });
}

module.exports = { registerMercatoHandlers, MIN_UPLIFT_RATIO, MAX_UPLIFT_RATIO };
