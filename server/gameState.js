// 8 data points per field (≈2 years of quarterly history) rather than a bare
// minimum — the whole point of Patch 8 is that you're taking over a bank with a
// real track record, not launching one from zero.
function seedFinanceHistory(now) {
  const day = 86400000;
  const series = {
    revenue: [1080, 1150, 1220, 1280, 1330, 1360, 1395, 1420],
    netIncome: [62, 71, 78, 85, 92, 98, 103, 108],
    aum: [230000, 242000, 253000, 260000, 267000, 273500, 279800, 284600],
    costIncomeRatio: [64.8, 63.5, 62.6, 61.2, 60.4, 59.5, 58.8, 58.3]
  };
  const history = [];
  Object.keys(series).forEach(field => {
    const values = series[field];
    for (let i = 1; i < values.length; i++) {
      history.push({
        ts: now - (values.length - i) * 45 * day,
        field, oldValue: values[i - 1], newValue: values[i],
        byPlayerId: null, byName: "Historique"
      });
    }
  });
  return history.sort((a, b) => b.ts - a.ts);
}

// Trading desk instruments — index-level prices (not per-share), so positions are
// sized directly in M$ notional and P&L is a clean `notional * (price/entry - 1)`,
// no unit conversion needed against the rest of financeKPIs (also in M$).
const MARKET_INSTRUMENTS_SEED = [
  { id: "eq-tech", name: "Actions Tech", category: "Actions", price: 142.5, volatility: 0.02 },
  { id: "eq-industrial", name: "Actions Industrielles", category: "Actions", price: 88.3, volatility: 0.015 },
  { id: "bond-sov", name: "Obligations Souveraines", category: "Obligations", price: 101.2, volatility: 0.005 },
  { id: "cmd-oil", name: "Pétrole Brent", category: "Matières Premières", price: 76.4, volatility: 0.025 },
  { id: "fx-eurusd", name: "EUR/USD (indice)", category: "Devises", price: 108.7, volatility: 0.008 },
  { id: "crypto", name: "Actifs numériques", category: "Crypto", price: 124.6, volatility: 0.04 }
];

function seedInstrumentHistory(currentPrice, volatility) {
  const points = 8;
  const history = [];
  let price = currentPrice / Math.pow(1 + volatility * 1.5, points - 1);
  for (let i = 0; i < points - 1; i++) {
    history.push(Math.round(price * 100) / 100);
    price *= 1 + (Math.random() * 2 - 0.8) * volatility * 1.5;
  }
  history.push(currentPrice);
  return history;
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
        createdByPlayerId: null, updatedAt: now, revenueBooked: false
      },
      {
        id: "deal-seed-2", name: "Projet Horizon — introduction en bourse Halcyon Digital Assets", stage: "Screening",
        valuation: 600, synergies: 0, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Étude préliminaire d'une introduction en bourse.",
        ddChecklist: [{ item: "Étude de faisabilité marché", done: true }, { item: "Revue de conformité préalable", done: false }],
        icVote: [{ item: "Validation Risques", done: false }, { item: "Validation Juridique", done: false }, { item: "Validation Direction Générale", done: false }],
        createdByPlayerId: null, updatedAt: now, revenueBooked: false
      },
      {
        id: "deal-seed-3", name: "Projet Meridian Bridge — refinancement Vantage Industrial", stage: "Négociation",
        valuation: 320, synergies: 8, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Refinancement de la dette senior de Vantage Industrial Holdings.",
        ddChecklist: [{ item: "Audit financier", done: true }, { item: "Audit juridique", done: true }],
        icVote: [{ item: "Validation Risques", done: true }, { item: "Validation Juridique", done: true }, { item: "Validation Direction Générale", done: false }],
        createdByPlayerId: null, updatedAt: now - 2 * 86400000, revenueBooked: false
      },
      {
        id: "deal-seed-4", name: "Projet Zenith — cession d'activité Cascade Energy", stage: "Signing",
        valuation: 275, synergies: 0, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Cession de la branche midstream de Cascade Energy Partners.",
        ddChecklist: [{ item: "Audit financier", done: true }, { item: "Audit juridique", done: true }],
        icVote: [{ item: "Validation Risques", done: true }, { item: "Validation Juridique", done: true }, { item: "Validation Direction Générale", done: true }],
        createdByPlayerId: null, updatedAt: now - 1 * 86400000, revenueBooked: false
      },
      {
        id: "deal-seed-5", name: "Projet Atlas Legacy — acquisition Solstice Pension add-on", stage: "Clôturé",
        valuation: 380, synergies: 15, leadBankerPlayerId: null, leadBankerName: "Équipe historique",
        description: "Opération clôturée sous la direction précédente — fait partie du palmarès repris.",
        ddChecklist: [{ item: "Audit financier", done: true }, { item: "Audit juridique", done: true }],
        icVote: [{ item: "Validation Risques", done: true }, { item: "Validation Juridique", done: true }, { item: "Validation Direction Générale", done: true }],
        createdByPlayerId: null, updatedAt: now - 60 * 86400000, revenueBooked: true
      },
      {
        id: "deal-seed-6", name: "Projet Compass — introduction en bourse Northbridge Retail", stage: "Clôturé",
        valuation: 510, synergies: 0, leadBankerPlayerId: null, leadBankerName: "Équipe historique",
        description: "Opération clôturée sous la direction précédente — fait partie du palmarès repris.",
        ddChecklist: [{ item: "Audit financier", done: true }, { item: "Audit juridique", done: true }],
        icVote: [{ item: "Validation Risques", done: true }, { item: "Validation Juridique", done: true }, { item: "Validation Direction Générale", done: true }],
        createdByPlayerId: null, updatedAt: now - 35 * 86400000, revenueBooked: true
      },
      {
        id: "deal-seed-7", name: "Projet Nimbus — levée de fonds Aurora Biotech", stage: "Screening",
        valuation: 190, synergies: 0, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Étude préliminaire d'une levée de série C pour Aurora Biotech Ventures.",
        ddChecklist: [{ item: "Étude de faisabilité marché", done: false }, { item: "Revue de conformité préalable", done: false }],
        icVote: [{ item: "Validation Risques", done: false }, { item: "Validation Juridique", done: false }, { item: "Validation Direction Générale", done: false }],
        createdByPlayerId: null, updatedAt: now, revenueBooked: false
      }
    ],
    clients: [
      {
        id: "cl-seed-1", name: "Kestrel Infrastructure Partners", industry: "Fonds d'infrastructure", aum: 3800, rmPlayerId: null, rmName: "Poste vacant", risk: "Medium", status: "Prospect",
        notes: [{ authorPlayerId: null, authorName: "Équipe historique", ts: now - 12 * 86400000, text: "Premier contact établi lors de la conférence infrastructures de mars." }],
        kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: false }, { item: "Sanctions & PEP", done: false }, { item: "Validation Conformité", done: false }],
        lastTouchedAt: now - 12 * 86400000
      },
      {
        id: "cl-seed-2", name: "Meridian Family Office", industry: "Gestion de fortune", aum: 1200, rmPlayerId: null, rmName: "Poste vacant", risk: "Low", status: "Actif",
        notes: [
          { authorPlayerId: null, authorName: "Équipe historique", ts: now - 90 * 86400000, text: "Client historique depuis 4 ans, relation de confiance établie." },
          { authorPlayerId: null, authorName: "Équipe historique", ts: now - 20 * 86400000, text: "Revue annuelle du portefeuille effectuée, allocation inchangée." }
        ],
        kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: true }, { item: "Sanctions & PEP", done: true }, { item: "Validation Conformité", done: true }],
        lastTouchedAt: now - 20 * 86400000
      },
      {
        id: "cl-seed-3", name: "Halcyon Digital Assets Fund", industry: "Actifs numériques", aum: 850, rmPlayerId: null, rmName: "Poste vacant", risk: "High", status: "En revue",
        notes: [{ authorPlayerId: null, authorName: "Surveillance automatique", ts: now - 5 * 86400000, text: "Basculé en revue suite à une activité inhabituelle sur le compte." }],
        kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: false }, { item: "Sanctions & PEP", done: false }, { item: "Validation Conformité", done: false }],
        lastTouchedAt: now - 5 * 86400000
      },
      {
        id: "cl-seed-4", name: "Vantage Industrial Holdings", industry: "Industrie manufacturière", aum: 6200, rmPlayerId: null, rmName: "Poste vacant", risk: "Medium", status: "Actif",
        notes: [
          { authorPlayerId: null, authorName: "Équipe historique", ts: now - 200 * 86400000, text: "Un des plus gros mandats du portefeuille, relation depuis l'introduction en bourse du groupe." },
          { authorPlayerId: null, authorName: "Équipe historique", ts: now - 45 * 86400000, text: "Discussion sur un refinancement en cours (voir Projet Meridian Bridge en M&A)." }
        ],
        kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: true }, { item: "Sanctions & PEP", done: true }, { item: "Validation Conformité", done: true }],
        lastTouchedAt: now - 8 * 86400000
      },
      {
        id: "cl-seed-5", name: "Solstice Pension Trust", industry: "Fonds de pension", aum: 9400, rmPlayerId: null, rmName: "Poste vacant", risk: "Low", status: "Actif",
        notes: [{ authorPlayerId: null, authorName: "Équipe historique", ts: now - 300 * 86400000, text: "Le plus important mandat institutionnel de la banque — à traiter en priorité." }],
        kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: true }, { item: "Sanctions & PEP", done: true }, { item: "Validation Conformité", done: true }],
        lastTouchedAt: now - 18 * 86400000
      },
      {
        id: "cl-seed-6", name: "Northbridge Retail Group", industry: "Distribution", aum: 2100, rmPlayerId: null, rmName: "Poste vacant", risk: "Medium", status: "Inactif",
        notes: [{ authorPlayerId: null, authorName: "Équipe historique", ts: now - 150 * 86400000, text: "Relation mise en veille après l'introduction en bourse (voir Projet Compass, clôturé)." }],
        kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: true }, { item: "Sanctions & PEP", done: true }, { item: "Validation Conformité", done: false }],
        lastTouchedAt: now - 150 * 86400000
      },
      {
        id: "cl-seed-7", name: "Aurora Biotech Ventures", industry: "Santé / Biotechnologies", aum: 1750, rmPlayerId: null, rmName: "Poste vacant", risk: "High", status: "Actif",
        notes: [{ authorPlayerId: null, authorName: "Équipe historique", ts: now - 30 * 86400000, text: "Discussion en cours sur une levée de série C (voir Projet Nimbus en M&A)." }],
        kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: true }, { item: "Sanctions & PEP", done: false }, { item: "Validation Conformité", done: false }],
        lastTouchedAt: now - 6 * 86400000
      },
      {
        id: "cl-seed-8", name: "Cascade Energy Partners", industry: "Énergie", aum: 4300, rmPlayerId: null, rmName: "Poste vacant", risk: "Medium", status: "Actif",
        notes: [{ authorPlayerId: null, authorName: "Équipe historique", ts: now - 60 * 86400000, text: "Cession d'une branche d'activité en cours (voir Projet Zenith en M&A)." }],
        kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: true }, { item: "Sanctions & PEP", done: true }, { item: "Validation Conformité", done: true }],
        lastTouchedAt: now - 22 * 86400000
      },
      {
        id: "cl-seed-9", name: "Ledger & Vine Capital", industry: "Capital-investissement", aum: 2600, rmPlayerId: null, rmName: "Poste vacant", risk: "Low", status: "Prospect",
        notes: [{ authorPlayerId: null, authorName: "Équipe historique", ts: now - 3 * 86400000, text: "Prise de contact récente, dossier de présentation envoyé." }],
        kycChecklist: [{ item: "Vérification d'identité", done: false }, { item: "Origine des fonds", done: false }, { item: "Sanctions & PEP", done: false }, { item: "Validation Conformité", done: false }],
        lastTouchedAt: now - 3 * 86400000
      },
      {
        id: "cl-seed-10", name: "Whitmore Shipping Co.", industry: "Transport maritime", aum: 1450, rmPlayerId: null, rmName: "Poste vacant", risk: "High", status: "En revue",
        notes: [{ authorPlayerId: null, authorName: "Équipe historique", ts: now - 8 * 86400000, text: "Vérification PEP en cours suite à un changement d'actionnariat." }],
        kycChecklist: [{ item: "Vérification d'identité", done: true }, { item: "Origine des fonds", done: false }, { item: "Sanctions & PEP", done: false }, { item: "Validation Conformité", done: false }],
        lastTouchedAt: now - 8 * 86400000
      }
    ],
    complianceItems: [
      { id: "cp-seed-1", type: "Surveillance marché", desk: "Bureau Actions", flag: "Volume inhabituel constaté avant une annonce de résultats.", status: "Ouvert", ts: now - 4 * 86400000, raisedByPlayerId: null, raisedByName: "Surveillance automatique", assignedToPlayerId: null, assignedToName: null },
      { id: "cp-seed-2", type: "KYC/AML", desk: "Gestion de Fortune", flag: "Contrôle KYC annuel — dossier Meridian Family Office.", status: "Résolu", ts: now - 10 * 86400000, raisedByPlayerId: null, raisedByName: "Équipe historique", assignedToPlayerId: null, assignedToName: null },
      { id: "cp-seed-3", type: "Réglementaire", desk: "Bureau Actions", flag: "Dépassement de seuil de position non régularisé.", status: "Escaladé", ts: now - 6 * 86400000, raisedByPlayerId: null, raisedByName: "Surveillance automatique", assignedToPlayerId: null, assignedToName: null },
      { id: "cp-seed-4", type: "Éthique & Déontologie", desk: "Fusions-Acquisitions (M&A)", flag: "Revue de conformité préalable — nouveau produit structuré.", status: "Ouvert", ts: now - 1 * 86400000, raisedByPlayerId: null, raisedByName: "Équipe historique", assignedToPlayerId: null, assignedToName: null },
      { id: "cp-seed-5", type: "KYC/AML", desk: "Transport maritime", flag: "Vérification PEP — client Whitmore Shipping Co.", status: "En cours d'analyse", ts: now - 2 * 86400000, raisedByPlayerId: null, raisedByName: "Équipe historique", assignedToPlayerId: null, assignedToName: null },
      { id: "cp-seed-6", type: "Réglementaire", desk: "Distribution", flag: "Signalement suspicion de blanchiment — Northbridge Retail Group.", status: "Ouvert", ts: now - 5 * 86400000, raisedByPlayerId: null, raisedByName: "Surveillance automatique", assignedToPlayerId: null, assignedToName: null }
    ],
    hr: {
      leaveRequests: [
        { id: "lv-seed-1", playerId: null, playerName: "Marc Delattre (Trading FICC)", type: "Congés payés", start: new Date(now + 5 * 86400000).toISOString().slice(0, 10), end: new Date(now + 12 * 86400000).toISOString().slice(0, 10), status: "En attente" },
        { id: "lv-seed-2", playerId: null, playerName: "Sophie Aubert (Conformité)", type: "RTT", start: new Date(now + 2 * 86400000).toISOString().slice(0, 10), end: new Date(now + 2 * 86400000).toISOString().slice(0, 10), status: "En attente" }
      ],
      morale: 74,
      headcountNPC: 0,
      openPositions: [
        { id: "pos-seed-1", dept: "Fusions-Acquisitions (M&A)", level: "Analyst", monthlySalary: 9, status: "Ouvert" },
        { id: "pos-seed-2", dept: "Trading FICC", level: "Associate", monthlySalary: 13, status: "Ouvert" }
      ],
      candidates: {
        "pos-seed-1": [
          { id: "cand-seed-1", name: "Julien Fabre", level: "Analyst", monthlySalary: 8.5, fitScore: 78, interviewed: false },
          { id: "cand-seed-2", name: "Camille Roussel", level: "Analyst", monthlySalary: 9.4, fitScore: 85, interviewed: false }
        ],
        "pos-seed-2": [
          { id: "cand-seed-3", name: "Léa Girard", level: "Associate", monthlySalary: 12.6, fitScore: 81, interviewed: false },
          { id: "cand-seed-4", name: "Nicolas Perrin", level: "Associate", monthlySalary: 13.8, fitScore: 69, interviewed: false }
        ]
      }
    },
    agenda: [
      { id: "ag-seed-1", title: "Comité de direction hebdomadaire", date: new Date(now + 2 * 86400000).toISOString().slice(0, 10), time: "09:00", participants: [], createdByPlayerId: null, createdByName: "Secrétariat Général" },
      { id: "ag-seed-2", title: "Point d'avancement — Projet Meridian Bridge", date: new Date(now + 1 * 86400000).toISOString().slice(0, 10), time: "14:30", participants: [], createdByPlayerId: null, createdByName: "Équipe historique" },
      { id: "ag-seed-3", title: "Revue trimestrielle des risques", date: new Date(now + 4 * 86400000).toISOString().slice(0, 10), time: "11:00", participants: [], createdByPlayerId: null, createdByName: "Secrétariat Général" },
      { id: "ag-seed-4", title: "Entretien candidat — poste Trading FICC", date: new Date(now + 3 * 86400000).toISOString().slice(0, 10), time: "16:00", participants: [], createdByPlayerId: null, createdByName: "Équipe historique" }
    ],
    documents: [
      { id: "doc-seed-1", name: "Mémo de transition — reprise de la direction.pdf", sizeKb: 210, uploadedByPlayerId: null, uploadedByName: "Conseil d'administration", ts: now - 1 * 86400000 },
      { id: "doc-seed-2", name: "Note_interne_conformite.pdf", sizeKb: 340, uploadedByPlayerId: null, uploadedByName: "Poste vacant", ts: now - 3 * 86400000 },
      { id: "doc-seed-3", name: "Rapport_trimestriel_T2.xlsx", sizeKb: 1180, uploadedByPlayerId: null, uploadedByName: "Poste vacant", ts: now - 6 * 86400000 },
      { id: "doc-seed-4", name: "Bilan_consolide_annuel.pdf", sizeKb: 2450, uploadedByPlayerId: null, uploadedByName: "Contrôle Financier", ts: now - 45 * 86400000 },
      { id: "doc-seed-5", name: "Due_diligence_Vantage_Industrial.pdf", sizeKb: 3100, uploadedByPlayerId: null, uploadedByName: "Équipe historique", ts: now - 2 * 86400000 },
      { id: "doc-seed-6", name: "Rapport_audit_interne_annuel.pdf", sizeKb: 1780, uploadedByPlayerId: null, uploadedByName: "Audit Interne", ts: now - 30 * 86400000 }
    ],
    expenseReports: [],
    financeKPIs: {
      revenue: 1420,
      netIncome: 108,
      aum: 284600,
      aumLegacyBase: 261750,
      costIncomeRatio: 58.3,
      equity: 18000,
      riskWeightedAssets: 145000,
      capitalRatio: Math.round((18000 / 145000) * 1000) / 10,
      esgScore: 60,
      // Deliberately over-allocated vs budgetPool.total (568) by 232 M$ — the new
      // Direction Générale inherits a cost structure already running over, a
      // concrete first priority rather than a clean slate.
      budgetPool: { total: Math.round(1420 * 0.4), allocated: 800 },
      lastDividendQuarter: 0,
      lastRetainQuarter: 0,
      history: seedFinanceHistory(now),
      budgetVsActual: [
        { dept: "Fusions-Acquisitions (M&A)", budget: 180, actual: 165 },
        { dept: "Trading FICC", budget: 220, actual: 245 },
        { dept: "Gestion de Fortune", budget: 90, actual: 88 },
        { dept: "Conformité", budget: 40, actual: 42 },
        { dept: "Ressources Humaines", budget: 25, actual: 24 },
        { dept: "Marchés Financiers", budget: 150, actual: 158 },
        { dept: "Gestion d'Actifs", budget: 60, actual: 55 },
        { dept: "Direction Générale", budget: 35, actual: 33 }
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
    victory: false,
    taskQueue: [],
    quarterHistory: [],
    paused: false,
    pausedAt: null,
    difficulty: "standard",
    hallOfFame: [],
    markets: {
      instruments: MARKET_INSTRUMENTS_SEED.map(i => ({ ...i, history: seedInstrumentHistory(i.price, i.volatility) })),
      positions: [],
      cash: 8000,
      realizedPnL: 0,
      tradeLog: []
    },
    directive: null
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
  const preservedHallOfFame = gameState.hallOfFame || [];
  const fresh = createGameState();
  Object.keys(fresh).forEach(key => {
    gameState[key] = fresh[key];
  });
  gameState.players = preservedPlayers;
  gameState.hallOfFame = preservedHallOfFame;
  return gameState;
}

const gameState = createGameState();

module.exports = { gameState, createGameState, pushActivity, resetGame };
