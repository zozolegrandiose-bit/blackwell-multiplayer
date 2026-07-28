// Per-player satisfaction (distinct from gameState.hr.morale, which is a company-
// wide gauge) -- a real individual stake tied to bonuses received and how leave
// requests/insider-trading sanctions land on that specific person. Checked at every
// market day settlement (the natural "end of period" review point already in this
// codebase): a critically dissatisfied player has a real chance of resigning,
// losing their seat and having to rejoin from scratch.
const { pushActivity, postTeamChat, buildPublicRoster } = require("./gameState");

const RESIGNATION_THRESHOLD = 20;
const RESIGNATION_PROBABILITY = 0.3;

function adjustSatisfaction(io, gameState, player, delta) {
  if (!player) return;
  player.satisfaction = Math.max(0, Math.min(100, Math.round((player.satisfaction == null ? 70 : player.satisfaction) + delta)));
  io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });
}

// Called from settleMarketDay() -- each critically dissatisfied player independently
// rolls a chance to resign. Resigning frees their slot (like releaseSlotBySocketId)
// but keeps their socket connected: their own client is told directly so it can
// return them to the join screen without a hard disconnect, matching the game's
// existing "resync without disconnect" convention (game:reset does the same).
function sweepResignations(io, gameState) {
  const atRisk = gameState.players.filter(p => (p.satisfaction == null ? 70 : p.satisfaction) < RESIGNATION_THRESHOLD);
  atRisk.forEach(player => {
    if (Math.random() >= RESIGNATION_PROBABILITY) return;
    const idx = gameState.players.findIndex(p => p.id === player.id);
    if (idx === -1) return;
    gameState.players.splice(idx, 1);

    pushActivity(gameState, { actorPlayerId: null, page: "hr", text: "🚪 " + player.fullName + " a démissionné, faute de reconnaissance suffisante — le poste " + player.grade + ", " + player.dept + " est de nouveau vacant." });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, {
      authorName: "IA — Ressources Humaines",
      text: "🚪 " + player.fullName + " nous quitte (satisfaction au plus bas). Le poste redevient disponible.",
      tone: "alert"
    });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
    io.to("game").emit("roster:update", { players: buildPublicRoster(gameState) });

    const resignedSocket = io.sockets.sockets.get(player.socketId);
    if (resignedSocket) {
      resignedSocket.data.playerId = null;
      resignedSocket.emit("game:youResigned", { reason: "Satisfaction trop basse — vous avez démissionné de votre poste." });
    }
  });
}

module.exports = { adjustSatisfaction, sweepResignations, RESIGNATION_THRESHOLD, RESIGNATION_PROBABILITY };
