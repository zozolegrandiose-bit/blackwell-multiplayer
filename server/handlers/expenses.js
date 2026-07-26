const { pushActivity } = require("../gameState");
const { awardPoints } = require("../scoring");

const EXPENSE_CATEGORIES = ["Transport", "Hôtel", "Repas d'affaires", "Divers"];
let nextExpenseId = 1;

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function canApprove(player) {
  return !!player && (player.hasFullAccess || player.access.includes("finance") || player.access.includes("hr"));
}

function registerExpensesHandlers(io, socket, gameState) {
  socket.on("expenses:submit", payload => {
    if (!requireAccess(socket, "expenses")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!player) return;

    const amount = Number(payload.amount);
    if (!EXPENSE_CATEGORIES.includes(payload.category) || Number.isNaN(amount) || amount <= 0) {
      socket.emit("expenses:submit:rejected", { reason: "Catégorie et montant valides requis." });
      return;
    }

    const expense = {
      id: "exp" + (nextExpenseId++),
      playerId: player.id,
      playerName: player.fullName,
      category: payload.category,
      amount,
      description: (payload.description || "").trim(),
      status: "En attente",
      ts: Date.now()
    };
    gameState.expenseReports.push(expense);

    io.to("access:expenses").emit("expenses:update", gameState.expenseReports);
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "expenses",
      text: player.fullName + " a soumis une note de frais."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    awardPoints(io, gameState, player, "expenses_submit");
  });

  socket.on("expenses:setStatus", payload => {
    if (!requireAccess(socket, "expenses")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    if (!canApprove(player)) return;
    const expense = gameState.expenseReports.find(e => e.id === payload.expenseId);
    if (!expense || !["Approuvé", "Refusé"].includes(payload.status)) return;

    expense.status = payload.status;
    io.to("access:expenses").emit("expenses:update", gameState.expenseReports);
    if (payload.status === "Approuvé") awardPoints(io, gameState, player, "expenses_approve");
  });
}

module.exports = { registerExpensesHandlers, EXPENSE_CATEGORIES, canApprove };
