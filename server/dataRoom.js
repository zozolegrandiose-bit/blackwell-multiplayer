// Data Room Interactive -- every M&A deal is seeded with 3 documents (bilan
// financier, EBITDA, dette nette) at creation. The Analyst has to actually
// analyze them to reveal the target's real fair value -- a genuine signal on
// whether the deal's stated valuation is rich or cheap, not just flavor text.
const { pushActivity } = require("./gameState");
const { awardPoints } = require("./scoring");

const EBITDA_MULTIPLE = 8;

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Reverse-engineered from the deal's stated valuation so the 3 figures are
// internally plausible, then perturbed so the resulting fair value can land
// meaningfully above or below the stated valuation -- a real signal, not a
// foregone conclusion.
function generateDataRoom(valuation) {
  const impliedEbitda = valuation / EBITDA_MULTIPLE;
  const ebitda = round1(impliedEbitda * (0.75 + Math.random() * 0.5));
  const detteNette = round1(valuation * (0.1 + Math.random() * 0.3));
  const bilanFinancier = round1(valuation * (0.8 + Math.random() * 0.4));
  return { bilanFinancier, ebitda, detteNette, analyzed: false, fairValue: null };
}

function requireAccess(socket, page) {
  return socket.rooms.has("access:" + page);
}

function registerDataRoomHandlers(io, socket, gameState) {
  socket.on("ma:analyzeDataRoom", payload => {
    if (!requireAccess(socket, "ma")) return;
    const player = gameState.players.find(p => p.id === socket.data.playerId);
    const deal = gameState.maDeals.find(d => d.id === payload.dealId);
    if (!player || !deal || !deal.dataRoom || deal.dataRoom.analyzed) return;

    const dr = deal.dataRoom;
    const fairValue = round1(dr.ebitda * EBITDA_MULTIPLE - dr.detteNette + dr.bilanFinancier * 0.05);
    dr.analyzed = true;
    dr.fairValue = fairValue;

    const gapPct = Math.round(((deal.valuation - fairValue) / fairValue) * 100);
    const verdict = gapPct > 10 ? "surévaluée" : gapPct < -10 ? "sous-évaluée" : "correctement valorisée";
    awardPoints(io, gameState, player, "ma_create");
    pushActivity(gameState, {
      actorPlayerId: player.id,
      page: "ma",
      text: player.fullName + " analyse la data room de « " + deal.name + " » — juste valeur estimée " + fairValue + " M$ (cible actuellement " + verdict + ", proposée à " + deal.valuation + " M$)."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    io.to("access:ma").emit("ma:update", gameState.maDeals);
  });
}

module.exports = { registerDataRoomHandlers, generateDataRoom, EBITDA_MULTIPLE };
