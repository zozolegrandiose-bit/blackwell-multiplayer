const { pushActivity } = require("../gameState");
const { awardPoints } = require("../scoring");

let nextDocId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function registerDocumentsHandlers(io, socket, gameState) {
  socket.on("documents:upload", payload => {
    if (!requireAccess(socket, "documents")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;

    const name = (payload.name || "").trim();
    if (!name) {
      socket.emit("documents:upload:rejected", { reason: "Le nom du document est requis." });
      return;
    }

    const doc = {
      id: "doc" + (nextDocId++),
      name,
      sizeKb: 50 + Math.floor(Math.random() * 2000),
      uploadedByPlayerId: player.id,
      uploadedByName: player.fullName,
      ts: Date.now()
    };
    gameState.documents.push(doc);

    io.to("access:documents").emit("documents:update", gameState.documents);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "documents",
      text: player.fullName + " a déposé un document : « " + name + " »."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    awardPoints(io, gameState, player, "documents_upload");
  });
}

module.exports = { registerDocumentsHandlers };
