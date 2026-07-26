const { pushActivity } = require("../gameState");

const MA_STAGES = ["Screening", "Due Diligence", "Négociation", "Signing", "Clôturé"];
let nextDealId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function registerMaHandlers(io, socket, gameState) {
  socket.on("ma:create", payload => {
    if (!requireAccess(socket, "ma")) return;
    const playerId = socket.data.playerId;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;

    const name = (payload.name || "").trim();
    if (!name) {
      socket.emit("ma:create:rejected", { reason: "Le nom du projet est requis." });
      return;
    }

    const deal = {
      id: "deal" + (nextDealId++),
      name,
      stage: "Screening",
      valuation: Number(payload.valuation) || 0,
      synergies: Number(payload.synergies) || 0,
      leadBankerPlayerId: player.id,
      leadBankerName: player.fullName,
      description: (payload.description || "").trim(),
      ddChecklist: [
        { item: "Audit financier", done: false },
        { item: "Audit juridique", done: false }
      ],
      createdByPlayerId: player.id,
      updatedAt: Date.now()
    };
    gameState.maDeals.push(deal);

    io.to("access:ma").emit("ma:update", gameState.maDeals);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "ma",
      text: player.fullName + " a créé un nouveau projet M&A."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  socket.on("ma:updateStage", payload => {
    if (!requireAccess(socket, "ma")) return;
    const playerId = socket.data.playerId;
    const player = gameState.players.find(p => p.id === playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!player || !deal || !MA_STAGES.includes(payload.stage)) return;

    deal.stage = payload.stage;
    deal.updatedAt = Date.now();
    io.to("access:ma").emit("ma:update", gameState.maDeals);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "ma",
      text: player.fullName + " a fait avancer un projet M&A à l'étape « " + payload.stage + " »."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });

  socket.on("ma:toggleChecklist", payload => {
    if (!requireAccess(socket, "ma")) return;
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!deal || !deal.ddChecklist[payload.index]) return;

    deal.ddChecklist[payload.index].done = !deal.ddChecklist[payload.index].done;
    deal.updatedAt = Date.now();
    io.to("access:ma").emit("ma:update", gameState.maDeals);
  });
}

module.exports = { registerMaHandlers, MA_STAGES };
