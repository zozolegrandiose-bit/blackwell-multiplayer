const { pushActivity } = require("../gameState");

const EDITABLE_FIELDS = ["revenue", "netIncome", "aum", "costIncomeRatio"];
const FIELD_LABELS = {
  revenue: "Revenus",
  netIncome: "Résultat net",
  aum: "AUM",
  costIncomeRatio: "Coefficient d'exploitation"
};

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function registerFinanceHandlers(io, socket, gameState) {
  socket.on("finance:updateKPI", payload => {
    if (!requireAccess(socket, "finance")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    if (!EDITABLE_FIELDS.includes(payload.field)) return;

    const newValue = Number(payload.value);
    if (Number.isNaN(newValue)) return;

    const oldValue = gameState.financeKPIs[payload.field];
    gameState.financeKPIs[payload.field] = newValue;
    gameState.financeKPIs.history.unshift({
      ts: Date.now(),
      field: payload.field,
      oldValue,
      newValue,
      byPlayerId: player.id,
      byName: player.fullName
    });
    if (gameState.financeKPIs.history.length > 100) gameState.financeKPIs.history.length = 100;

    io.to("access:finance").emit("finance:update", gameState.financeKPIs);
    io.to("game").emit("overview:kpis", gameState.financeKPIs);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "finance",
      text: player.fullName + " a mis à jour " + FIELD_LABELS[payload.field] + "."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
}

module.exports = { registerFinanceHandlers, EDITABLE_FIELDS, FIELD_LABELS };
