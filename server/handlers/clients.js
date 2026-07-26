const { pushActivity } = require("../gameState");
const { awardPoints, checkEventResolution } = require("../scoring");
const { recomputeAum } = require("./finance");

const CLIENT_STATUSES = ["Prospect", "Actif", "En revue", "Inactif"];
const CLIENT_RISKS = ["Low", "Medium", "High"];
const KYC_ITEMS = ["Vérification d'identité", "Origine des fonds", "Sanctions & PEP", "Validation Conformité"];
const AMBIENT_NOTES = [
  "Suivi de routine effectué, rien à signaler.",
  "Relance programmée pour le prochain trimestre.",
  "Point de synthèse partagé avec l'équipe.",
  "Dossier vérifié, aucune action requise pour l'instant."
];
let nextClientId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

// Reusable: mutate + broadcast + log, callable from the socket handler (real player)
// or from server/ai.js (synthetic actor) when nobody has access to the "clients" page.
function addRandomClientNote(io, gameState, actor) {
  if (!gameState.clients.length) return false;
  const client = gameState.clients[Math.floor(Math.random() * gameState.clients.length)];
  const text = AMBIENT_NOTES[Math.floor(Math.random() * AMBIENT_NOTES.length)];
  client.notes.push({ authorPlayerId: actor.id, authorName: actor.fullName, ts: Date.now(), text });
  io.to("access:clients").emit("clients:update", gameState.clients);
  pushActivity(gameState, {
    actorPlayerId: actor.id,
    page: "clients",
    text: actor.fullName + " a ajouté une note sur « " + client.name + " »."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  return true;
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
      notes: [],
      kycChecklist: KYC_ITEMS.map(item => ({ item, done: false }))
    };
    gameState.clients.push(client);

    io.to("access:clients").emit("clients:update", gameState.clients);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "clients",
      text: player.fullName + " a ajouté un nouveau client."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    awardPoints(io, gameState, player, "clients_create");
  });

  socket.on("clients:updateStatus", payload => {
    if (!requireAccess(socket, "clients")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const client = gameState.clients.find(c => c.id === payload.clientId);
    if (!client || !CLIENT_STATUSES.includes(payload.status)) return;
    const wasActive = client.status === "Actif";
    client.status = payload.status;
    io.to("access:clients").emit("clients:update", gameState.clients);
    if (wasActive !== (client.status === "Actif")) {
      recomputeAum(gameState);
      io.to("access:finance").emit("finance:update", gameState.financeKPIs);
      io.to("game").emit("overview:kpis", gameState.financeKPIs);
    }
    if (payload.status !== "En revue") checkEventResolution(io, gameState, client.id, player);
  });

  socket.on("clients:addNote", payload => {
    if (!requireAccess(socket, "clients")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const client = gameState.clients.find(c => c.id === payload.clientId);
    const text = (payload.text || "").trim();
    if (!player || !client || !text) return;

    client.notes.push({ authorPlayerId: player.id, authorName: player.fullName, ts: Date.now(), text });
    io.to("access:clients").emit("clients:update", gameState.clients);
    awardPoints(io, gameState, player, "clients_note");
    checkEventResolution(io, gameState, client.id, player);
  });

  socket.on("clients:toggleKyc", payload => {
    if (!requireAccess(socket, "clients")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const client = gameState.clients.find(c => c.id === payload.clientId);
    if (!client || !client.kycChecklist || !client.kycChecklist[payload.index]) return;

    const wasDone = client.kycChecklist[payload.index].done;
    client.kycChecklist[payload.index].done = !wasDone;
    io.to("access:clients").emit("clients:update", gameState.clients);
    if (!wasDone) awardPoints(io, gameState, player, "clients_kycDone");
  });
}

module.exports = { registerClientsHandlers, CLIENT_STATUSES, CLIENT_RISKS, KYC_ITEMS, addRandomClientNote };
