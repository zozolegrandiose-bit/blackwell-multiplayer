const { pushActivity } = require("../gameState");

const CLIENT_STATUSES = ["Prospect", "Actif", "En revue", "Inactif"];
const CLIENT_RISKS = ["Low", "Medium", "High"];
let nextClientId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function registerClientsHandlers(io, socket, gameState) {
  socket.on("clients:create", payload => {
    if (!requireAccess(socket, "clients")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;

    const name = (payload.name || "").trim();
    if (!name) {
      socket.emit("clients:create:rejected", { reason: "Le nom du client est requis." });
      return;
    }

    const client = {
      id: "cl" + (nextClientId++),
      name,
      industry: (payload.industry || "").trim() || "—",
      aum: Number(payload.aum) || 0,
      rmPlayerId: player.id,
      rmName: player.fullName,
      risk: CLIENT_RISKS.includes(payload.risk) ? payload.risk : "Medium",
      status: "Prospect",
      notes: []
    };
    gameState.clients.push(client);

    io.to("access:clients").emit("clients:update", gameState.clients);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "clients",
      text: player.fullName + " a ajouté un nouveau client."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  socket.on("clients:updateStatus", payload => {
    if (!requireAccess(socket, "clients")) return;
    const client = gameState.clients.find(c => c.id === payload.clientId);
    if (!client || !CLIENT_STATUSES.includes(payload.status)) return;
    client.status = payload.status;
    io.to("access:clients").emit("clients:update", gameState.clients);
  });

  socket.on("clients:addNote", payload => {
    if (!requireAccess(socket, "clients")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const client = gameState.clients.find(c => c.id === payload.clientId);
    const text = (payload.text || "").trim();
    if (!player || !client || !text) return;

    client.notes.push({ authorPlayerId: player.id, authorName: player.fullName, ts: Date.now(), text });
    io.to("access:clients").emit("clients:update", gameState.clients);
  });
}

module.exports = { registerClientsHandlers, CLIENT_STATUSES, CLIENT_RISKS };
