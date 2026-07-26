const { resetGame, pushActivity } = require("../gameState");
const { buildSnapshot } = require("./join");

function registerGameHandlers(io, socket, gameState) {
  socket.on("game:requestReset", () => {
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player || !player.hasFullAccess) return;

    const topScore = Object.values(gameState.playerScores).sort((a, b) => b.score - a.score)[0] || null;

    resetGame(gameState);

    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "overview",
      text: player.fullName + " a lancé une nouvelle partie." +
        (topScore ? " Meilleur score de la partie précédente : " + topScore.fullName + " (" + topScore.score + " pts)." : "")
    });

    gameState.players.forEach(p => {
      const targetSocket = io.sockets.sockets.get(p.socketId);
      if (!targetSocket) return;
      targetSocket.emit("game:reset", { player: p, snapshot: buildSnapshot(gameState, p) });
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
}

module.exports = { registerGameHandlers };
