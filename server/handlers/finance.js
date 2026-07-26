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

// Reusable: mutate + broadcast + log, callable from the socket handler (real player)
// or from server/ai.js (synthetic actor) when nobody has access to the "finance" page.
function nudgeRandomKPI(io, gameState, actor) {
  const field = EDITABLE_FIELDS[Math.floor(Math.random() * EDITABLE_FIELDS.length)];
  const oldValue = gameState.financeKPIs[field];
  const pctChange = (Math.random() * 4 - 1.5) / 100; // entre -1.5% et +2.5%
  const newValue = Math.round(oldValue * (1 + pctChange) * 10) / 10;
  gameState.financeKPIs[field] = newValue;
  gameState.financeKPIs.history.unshift({
    ts: Date.now(), field, oldValue, newValue, byPlayerId: actor.id, byName: actor.fullName
  });
  if (gameState.financeKPIs.history.length > 100) gameState.financeKPIs.history.length = 100;

  io.to("access:finance").emit("finance:update", gameState.financeKPIs);
  io.to("game").emit("overview:kpis", gameState.financeKPIs);
  pushActivity(gameState, {
    actorPlayerId: actor.id,
    page: "finance",
    text: actor.fullName + " a mis à jour " + FIELD_LABELS[field] + "."
  });
  io.to("game").emit("activity:update", gameState.activityLog[0]);
  return true;
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

  socket.on("finance:updateBudgetActual", payload => {
    if (!requireAccess(socket, "finance")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;
    const row = gameState.financeKPIs.budgetVsActual.find(r => r.dept === payload.dept);
    const newValue = Number(payload.actual);
    if (!row || Number.isNaN(newValue)) return;

    row.actual = newValue;
    io.to("access:finance").emit("finance:update", gameState.financeKPIs);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "finance",
      text: player.fullName + " a mis à jour le réalisé budgétaire de " + payload.dept + "."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
  });
}

module.exports = { registerFinanceHandlers, EDITABLE_FIELDS, FIELD_LABELS, nudgeRandomKPI };
