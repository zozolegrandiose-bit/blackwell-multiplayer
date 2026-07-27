// Rating Agency -- an autonomous agent, no socket handlers of its own. Runs once
// per market day settlement (server/marketDay.js's settleMarketDay(), the natural
// "end of day" hook already in the codebase). Blackwell & Co's rating is a real
// calculation off its own solvency (financeKPIs.capitalRatio, already computed
// elsewhere) and a liquidity proxy (trading cash cushion vs risk-weighted assets);
// rival banks are NPC/flavor entities everywhere else in this game (rivalTalent,
// league table), so they get a lighter pnl-trend nudge rather than a full balance
// sheet. The rating then directly changes the net fee Blackwell books on every deal
// execution (server/handlers/dealWorkflow.js) -- a genuinely worse rating means a
// genuinely more expensive cost of borrowing, not just a cosmetic label.
const { pushActivity, postTeamChat } = require("./gameState");

const PLAYER_BANK_NAME = "Blackwell & Co Capital";
const RATING_SCALE = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "D"];

// Higher solvency+liquidity composite score -> better rating. Thresholds chosen so
// Blackwell's inherited starting balance sheet (capitalRatio 12.4%, thin trading
// cash cushion) lands solidly in BBB -- investment grade, but real room to slip.
const RATING_THRESHOLDS = [
  { min: 15, rating: "AAA" },
  { min: 13, rating: "AA" },
  { min: 11, rating: "A" },
  { min: 8, rating: "BBB" },
  { min: 6, rating: "BB" },
  { min: 4, rating: "B" },
  { min: 2, rating: "CCC" },
  { min: -Infinity, rating: "D" }
];

// A worse rating means more expensive borrowing -- this multiplies the net fee
// Blackwell books on every deal execution (both plain and syndicated). AAA banks
// borrow cheaply and keep more of the spread; a D-rated bank is bleeding most of
// its margin just servicing its own cost of capital.
const NET_FEE_RATING_MULTIPLIER = {
  AAA: 1.15, AA: 1.10, A: 1.0, BBB: 0.92, BB: 0.8, B: 0.65, CCC: 0.5, D: 0.35
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function scoreToRating(score) {
  const match = RATING_THRESHOLDS.find(t => score >= t.min);
  return match.rating;
}

function computeBlackwellRating(gameState) {
  const kpis = gameState.financeKPIs;
  const solvencyRatio = kpis.capitalRatio;
  const liquidityRatio = round2((gameState.markets.cash / Math.max(1, kpis.riskWeightedAssets)) * 100);
  const compositeScore = round2(solvencyRatio * 0.6 + liquidityRatio * 0.4);
  return { rating: scoreToRating(compositeScore), solvencyRatio, liquidityRatio, compositeScore };
}

// Rival banks have no balance sheet to speak of -- a one-notch nudge toward better
// or worse based on whether their league-table P&L grew or shrank this market day
// keeps them dynamic without fabricating detail this game doesn't otherwise track.
function computeRivalRating(gameState, bankName) {
  const current = gameState.creditRatings[bankName];
  const currentIdx = RATING_SCALE.indexOf(current.rating);
  const pnlNow = gameState.leagueTable[bankName].pnl;
  const pnlBefore = gameState.marketDay.dayStartLeagueTable[bankName] || 0;
  const delta = pnlNow - pnlBefore;
  let newIdx = currentIdx;
  if (delta > 0.5) newIdx = Math.max(0, currentIdx - 1);
  else if (delta < -0.5) newIdx = Math.min(RATING_SCALE.length - 1, currentIdx + 1);
  return RATING_SCALE[newIdx];
}

function getBorrowingCostMultiplier(gameState) {
  const rating = gameState.creditRatings[PLAYER_BANK_NAME].rating;
  return NET_FEE_RATING_MULTIPLIER[rating] || 1.0;
}

// Called from settleMarketDay() -- pure mutation + broadcast, matching the
// pushActivity/postTeamChat convention used throughout this codebase.
function runRatingAgency(io, gameState) {
  const bwResult = computeBlackwellRating(gameState);
  const oldBwRating = gameState.creditRatings[PLAYER_BANK_NAME].rating;
  gameState.creditRatings[PLAYER_BANK_NAME] = {
    rating: bwResult.rating,
    solvencyRatio: bwResult.solvencyRatio,
    liquidityRatio: bwResult.liquidityRatio,
    updatedAt: Date.now()
  };

  if (bwResult.rating !== oldBwRating) {
    const oldIdx = RATING_SCALE.indexOf(oldBwRating);
    const newIdx = RATING_SCALE.indexOf(bwResult.rating);
    const upgraded = newIdx < oldIdx;
    pushActivity(gameState, {
      actorPlayerId: null,
      page: "overview",
      text: "📐 Rating Agency " + (upgraded ? "relève" : "abaisse") + " la note de Blackwell & Co Capital : " + oldBwRating + " → " + bwResult.rating + "."
    });
    io.to("game").emit("activity:update", gameState.activityLog[0]);
    postTeamChat(gameState, {
      authorName: "IA — Rating Agency",
      text: "📐 Notre note de crédit passe de " + oldBwRating + " à " + bwResult.rating + " (solvabilité " + bwResult.solvencyRatio + "%, liquidité " + bwResult.liquidityRatio + "%)" + (upgraded ? " — le coût de nos emprunts baisse." : " — le coût de nos emprunts augmente."),
      tone: upgraded ? "congrats" : "alert"
    });
    io.to("game").emit("teamChat:update", gameState.teamChat[0]);
  }

  Object.keys(gameState.leagueTable)
    .filter(name => name !== PLAYER_BANK_NAME)
    .forEach(bankName => {
      const newRating = computeRivalRating(gameState, bankName);
      gameState.creditRatings[bankName] = {
        rating: newRating,
        solvencyRatio: null,
        liquidityRatio: null,
        updatedAt: Date.now()
      };
    });

  io.to("game").emit("creditRatings:update", gameState.creditRatings);
}

module.exports = { runRatingAgency, computeBlackwellRating, computeRivalRating, getBorrowingCostMultiplier, RATING_SCALE, NET_FEE_RATING_MULTIPLIER, PLAYER_BANK_NAME };
