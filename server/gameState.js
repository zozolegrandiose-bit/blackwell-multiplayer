function seedFinanceHistory(now) {
  const day = 86400000;
  const series = {
    revenue: [1250, 1310, 1360, 1395, 1420],
    netIncome: [85, 92, 98, 103, 108],
    aum: [260000, 267000, 273500, 279800, 284600],
    costIncomeRatio: [61.2, 60.4, 59.5, 58.8, 58.3]
  };
  const history = [];
  Object.keys(series).forEach(field => {
    const values = series[field];
    for (let i = 1; i < values.length; i++) {
      history.push({
        ts: now - (values.length - i) * 12 * day,
        field, oldValue: values[i - 1], newValue: values[i],
        byPlayerId: null, byName: "Historique"
      });
    }
  });
  return history.sort((a, b) => b.ts - a.ts);
}

function createGameState() {
  const now = Date.now();
  return {
    createdAt: Date.now(),
    players: [],
    mail: [],
    maDeals: [
      {
        id: "deal-seed-1", name: "Projet Sapphire — acquisition Cobalt Ridge Capital", stage: "Due Diligence",
        valuation: 450, synergies: 22, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Étude d'un rapprochement stratégique entre Cobalt Ridge Capital et un fonds concurrent.",
        ddChecklist: [{ item: "Audit financier", done: true }, { item: "Audit juridique", done: false }],
        icVote: [{ item: "Validation Risques", done: true }, { item: "Validation Juridique", done: false }, { item: "Validation Direction Générale", done: false }],
        createdByPlayerId: null, updatedAt: Date.now()
      },
      {
        id: "deal-seed-2", name: "Projet Horizon — introduction en bourse Halcyon Digital Assets", stage: "Screening",
        valuation: 600, synergies: 0, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Étude préliminaire d'une introduction en bourse.",
        ddChecklist: [{ item: "Étude de faisabilité marché", done: true }, { item: "Revue de conformité préalable", done: false }],
        icVote: [{ item: "Validation Risques", done: false }, { item: "Validation Juridique", done: false }, { item: "Validation Direction Générale", done: false }],
        createdByPlayerId: null, updatedAt: Date.now()
      }
    ],
    clients: [
      { id: "cl-seed-1", name: "Kestrel Infrastructure Partners", industry: "Fonds d'infrastructure", aum: 3800, rmPlayerId: null, rmName: "Poste vacant", risk: "Medium", status: "Prospect", notes: [], kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: false }, { item: "Sanctions & PEP", done: false }, { item: "Validation Conformité", done: false }] },
      { id: "cl-seed-2", name: "Meridian Family Office", industry: "Gestion de fortune", aum: 1200, rmPlayerId: null, rmName: "Poste vacant", risk: "Low", status: "Actif", notes: [], kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: true }, { item: "Sanctions & PEP", done: true }, { item: "Validation Conformité", done: true }] },
      { id: "cl-seed-3", name: "Halcyon Digital Assets Fund", industry: "Actifs numériques", aum: 850, rmPlayerId: null, rmName: "Poste vacant", risk: "High", status: "En revue", notes: [], kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: false }, { item: "Sanctions & PEP", done: false }, { item: "Validation Conformité", done: false }] }
    ],
    complianceItems: [
      { id: "cp-seed-1", type: "Surveillance marché", desk: "Bureau Actions", flag: "Volume inhabituel constaté avant une annonce de résultats.", status: "Ouvert", ts: now - 4 * 86400000, raisedByPlayerId: null, raisedByName: "Surveillance automatique", assignedToPlayerId: null, assignedToName: null }
    ],
    hr: { leaveRequests: [] },
    agenda: [
      { id: "ag-seed-1", title: "Comité de direction hebdomadaire", date: new Date(now + 2 * 86400000).toISOString().slice(0, 10), time: "09:00", participants: [], createdByPlayerId: null, createdByName: "Secrétariat Général" }
    ],
    documents: [
      { id: "doc-seed-1", name: "Note_interne_conformite.pdf", sizeKb: 340, uploadedByPlayerId: null, uploadedByName: "Poste vacant", ts: now - 3 * 86400000 },
      { id: "doc-seed-2", name: "Rapport_trimestriel_T2.xlsx", sizeKb: 1180, uploadedByPlayerId: null, uploadedByName: "Poste vacant", ts: now - 6 * 86400000 }
    ],
    expenseReports: [],
    financeKPIs: {
      revenue: 1420,
      netIncome: 108,
      aum: 284600,
      costIncomeRatio: 58.3,
      history: seedFinanceHistory(now),
      budgetVsActual: [
        { dept: "Fusions-Acquisitions (M&A)", budget: 180, actual: 165 },
        { dept: "Trading FICC", budget: 220, actual: 245 },
        { dept: "Gestion de Fortune", budget: 90, actual: 88 },
        { dept: "Conformité", budget: 40, actual: 42 },
        { dept: "Ressources Humaines", budget: 25, actual: 24 }
      ]
    },
    activityLog: [],
    playerScores: {},
    bankHealth: 100,
    bankrupt: false,
    activeEvents: [],
    currentQuarter: 1,
    quarterPhase: "deciding",
    quarterDeadline: null,
    quarterDecisions: {},
    campaignGoal: { targetAUM: 500000, maxQuarters: 20 },
    victory: false
  };
}

const MAX_ACTIVITY_LOG = 200;

function pushActivity(gameState, entry) {
  gameState.activityLog.unshift({ ts: Date.now(), ...entry });
  if (gameState.activityLog.length > MAX_ACTIVITY_LOG) {
    gameState.activityLog.length = MAX_ACTIVITY_LOG;
  }
}

// Rebuilds all business state in place (same object reference, so every module
// that captured `gameState` by reference stays valid) while preserving the
// array of currently-connected players — resetting must not drop live
// Socket.io room memberships or force a reconnect.
function resetGame(gameState) {
  const preservedPlayers = gameState.players;
  const fresh = createGameState();
  Object.keys(fresh).forEach(key => {
    gameState[key] = fresh[key];
  });
  gameState.players = preservedPlayers;
  return gameState;
}

const gameState = createGameState();

module.exports = { gameState, createGameState, pushActivity, resetGame };
