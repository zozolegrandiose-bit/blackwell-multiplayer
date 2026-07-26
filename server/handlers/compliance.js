const { pushActivity } = require("../gameState");

const COMPLIANCE_TYPES = ["Surveillance marché", "Éthique & Déontologie", "KYC/AML", "Réglementaire"];
const COMPLIANCE_STATUSES = ["Ouvert", "En cours d'analyse", "Résolu", "Escaladé"];
const STATUS_PROGRESSION = { "Ouvert": "En cours d'analyse", "En cours d'analyse": "Résolu", "Escaladé": "En cours d'analyse" };
let nextItemId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

// Reusable: mutate + broadcast + log, callable from the socket handler (real player)
// or from server/ai.js (synthetic actor) when nobody has access to the "compliance" page.
function progressRandomComplianceItem(io, gameState, actor) {
  const eligible = gameState.complianceItems.filter(i => STATUS_PROGRESSION[i.status]);
  if (!eligible.length) return false;
  const item = eligible[Math.floor(Math.random() * eligible.length)];
  item.status = STATUS_PROGRESSION[item.status];
  io.to("access:compliance").emit("compliance:update", gameState.complianceItems);
  pushActivity(gameState, {
    actorPlayerId: actor.id,
    page: "compliance",
    text: actor.fullName + " a fait progresser une alerte de conformité vers « " + item.status + " »."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  return true;
}

function registerComplianceHandlers(io, socket, gameState) {
  socket.on("compliance:create", payload => {
    if (!requireAccess(socket, "compliance")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;

    const flag = (payload.flag || "").trim();
    if (!flag) {
      socket.emit("compliance:create:rejected", { reason: "La description de l'alerte est requise." });
      return;
    }

    const item = {
      id: "cp" + (nextItemId++),
      type: COMPLIANCE_TYPES.includes(payload.type) ? payload.type : COMPLIANCE_TYPES[0],
      desk: (payload.desk || "").trim() || "—",
      flag,
      status: "Ouvert",
      ts: Date.now(),
      raisedByPlayerId: player.id,
      raisedByName: player.fullName,
      assignedToPlayerId: null,
      assignedToName: null
    };
    gameState.complianceItems.push(item);

    io.to("access:compliance").emit("compliance:update", gameState.complianceItems);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "compliance",
      text: player.fullName + " a signalé une alerte de conformité."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  socket.on("compliance:updateStatus", payload => {
    if (!requireAccess(socket, "compliance")) return;
    const item = gameState.complianceItems.find(i => i.id === payload.itemId);
    if (!item || !COMPLIANCE_STATUSES.includes(payload.status)) return;
    item.status = payload.status;
    io.to("access:compliance").emit("compliance:update", gameState.complianceItems);
  });

  socket.on("compliance:assign", payload => {
    if (!requireAccess(socket, "compliance")) return;
    const item = gameState.complianceItems.find(i => i.id === payload.itemId);
    if (!item) return;
    if (!payload.playerId) {
      item.assignedToPlayerId = null;
      item.assignedToName = null;
    } else {
      const assignee = gameState.players.find(p => p.id === payload.playerId);
      if (!assignee) return;
      item.assignedToPlayerId = assignee.id;
      item.assignedToName = assignee.fullName;
    }
    io.to("access:compliance").emit("compliance:update", gameState.complianceItems);
  });
}

module.exports = { registerComplianceHandlers, COMPLIANCE_TYPES, COMPLIANCE_STATUSES, progressRandomComplianceItem };
