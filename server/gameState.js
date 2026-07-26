function createGameState() {
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
        createdByPlayerId: null, updatedAt: Date.now()
      },
      {
        id: "deal-seed-2", name: "Projet Horizon — introduction en bourse Halcyon Digital Assets", stage: "Screening",
        valuation: 600, synergies: 0, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Étude préliminaire d'une introduction en bourse.",
        ddChecklist: [{ item: "Étude de faisabilité marché", done: true }, { item: "Revue de conformité préalable", done: false }],
        createdByPlayerId: null, updatedAt: Date.now()
      }
    ],
    clients: [
      { id: "cl-seed-1", name: "Kestrel Infrastructure Partners", industry: "Fonds d'infrastructure", aum: 3800, rmPlayerId: null, rmName: "Poste vacant", risk: "Medium", status: "Prospect", notes: [] },
      { id: "cl-seed-2", name: "Meridian Family Office", industry: "Gestion de fortune", aum: 1200, rmPlayerId: null, rmName: "Poste vacant", risk: "Low", status: "Actif", notes: [] },
      { id: "cl-seed-3", name: "Halcyon Digital Assets Fund", industry: "Actifs numériques", aum: 850, rmPlayerId: null, rmName: "Poste vacant", risk: "High", status: "En revue", notes: [] }
    ],
    complianceItems: [
      { id: "cp-seed-1", type: "Surveillance marché", desk: "Bureau Actions", flag: "Volume inhabituel constaté avant une annonce de résultats.", status: "Ouvert", ts: Date.now(), raisedByPlayerId: null, raisedByName: "Surveillance automatique" }
    ],
    hr: { leaveRequests: [] },
    financeKPIs: {
      revenue: 1420,
      netIncome: 108,
      aum: 284600,
      costIncomeRatio: 58.3,
      history: []
    },
    activityLog: []
  };
}

const MAX_ACTIVITY_LOG = 200;

function pushActivity(gameState, entry) {
  gameState.activityLog.unshift({ ts: Date.now(), ...entry });
  if (gameState.activityLog.length > MAX_ACTIVITY_LOG) {
    gameState.activityLog.length = MAX_ACTIVITY_LOG;
  }
}

const gameState = createGameState();

module.exports = { gameState, createGameState, pushActivity };
