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
  { id: "crypto", name: "Actifs numériques", category: "Crypto", price: 124.6, volatility: 0.04 },
  // Taux (Patch 22) -- prices are basis points (425 = 4.25%), tradeable like any
  // other instrument via markets:buy so the Central Bank & Monetary Policy
  // module (server/centralBank.js) can move them with real, arbitrage-able P&L.
  { id: "rate-us10y", name: "US 10Y", category: "Taux", price: 425, volatility: 0.01 },
  { id: "rate-euribor", name: "Euribor 3M", category: "Taux", price: 350, volatility: 0.01 }
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

// Duplicated in miniature from server/dataRoom.js's generateDataRoom() -- kept
// local rather than required, since dataRoom.js itself requires this file
// (for pushActivity), which would close a require cycle.
function seedDataRoom(valuation) {
  const ebitda = Math.round((valuation / 8) * (0.85 + 0.15) * 10) / 10;
  const detteNette = Math.round(valuation * 0.2 * 10) / 10;
  const bilanFinancier = Math.round(valuation * 0.95 * 10) / 10;
  return { bilanFinancier, ebitda, detteNette, analyzed: false, fairValue: null };
}

// Duplicated in miniature from server/aiAgents.js's AI_AGENTS_SEED -- kept local
// for the same require-cycle reason as seedDataRoom above (aiAgents.js requires
// this file for pushActivity/postTeamChat).
function seedAiAgents() {
  return [
    { id: "agent-trader-1", name: "Marcus Chen", role: "TRADING", roleLabel: "Trader IA", personality: "cowboy" },
    { id: "agent-ma-1", name: "Julien Beaumont", role: "MA", roleLabel: "Analyste M&A IA", personality: "dealmaker" },
    { id: "agent-risk-1", name: "Elena Kowalski", role: "RISK", roleLabel: "Risk Manager IA", personality: "institutional" }
  ];
}

// Duplicated in miniature from server/globalBank.js's seedGlobalBank() -- kept
// local for the same require-cycle reason as seedDataRoom above (globalBank.js
// requires this file for pushActivity/postTeamChat).
function seedGlobalBank() {
  const entities = [
    { id: "ny", name: "Blackwell & Co Capital, N.A.", city: "New York", region: "AMER", headcount: 145000, regulatoryBody: "FED / SEC", allocatedCapital: 4200, localPnL: 0, activeDesks: ["TRADING", "MA", "TREASURY", "RISK"], isMarketOpen: false, timezone: "America/New_York", capitalRatioPct: 15.2, payrollCostM: 2100 },
    { id: "fra", name: "Blackwell & Co Europe SE", city: "Francfort", region: "EMEA", headcount: 62000, regulatoryBody: "BCE (ECB)", allocatedCapital: 1800, localPnL: 0, activeDesks: ["MA", "PRIVATE_BANKING", "RISK"], isMarketOpen: false, timezone: "Europe/Berlin", capitalRatioPct: 13.8, payrollCostM: 980 },
    { id: "hk", name: "Blackwell & Co Securities Asia", city: "Hong Kong", region: "APAC", headcount: 38000, regulatoryBody: "SFC / MAS", allocatedCapital: 1200, localPnL: 0, activeDesks: ["TRADING", "PRIVATE_BANKING"], isMarketOpen: false, timezone: "Asia/Hong_Kong", capitalRatioPct: 14.6, payrollCostM: 640 },
    { id: "ldn", name: "Blackwell & Co International Bank", city: "Londres", region: "EMEA", headcount: 54000, regulatoryBody: "FCA", allocatedCapital: 1500, localPnL: 0, activeDesks: ["TRADING", "TREASURY", "RH"], isMarketOpen: false, timezone: "Europe/London", capitalRatioPct: 14.1, payrollCostM: 860 }
  ];
  return {
    bankName: "Blackwell & Co Capital",
    totalGlobalHeadcount: entities.reduce((sum, e) => sum + e.headcount, 0),
    globalPnL: 0,
    globalTier1CapitalRatio: 14.5,
    entities
  };
}

function createGameState() {
  const now = Date.now();
  const state = {
    createdAt: Date.now(),
    players: [],
    mail: [],
    maDeals: [
      {
        id: "deal-seed-1", name: "Projet Sapphire — acquisition Cobalt Ridge Capital", stage: "Due Diligence",
        valuation: 450, synergies: 22, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Étude d'un rapprochement stratégique entre Cobalt Ridge Capital et un fonds concurrent.",
        ddChecklist: [{ item: "Audit financier", done: true }, { item: "Audit juridique", done: false }],
        icVote: [{ item: "Validation Risques", done: true }, { item: "Validation Juridique", done: false }, { item: "Validation Board Of Directors", done: false }],
        createdByPlayerId: null, updatedAt: now, revenueBooked: false, workflow: null
      },
      {
        id: "deal-seed-2", name: "Projet Horizon — introduction en bourse Halcyon Digital Assets", stage: "Screening",
        valuation: 600, synergies: 0, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Étude préliminaire d'une introduction en bourse.",
        ddChecklist: [{ item: "Étude de faisabilité marché", done: true }, { item: "Revue de conformité préalable", done: false }],
        icVote: [{ item: "Validation Risques", done: false }, { item: "Validation Juridique", done: false }, { item: "Validation Board Of Directors", done: false }],
        createdByPlayerId: null, updatedAt: now, revenueBooked: false, workflow: null
      },
      {
        id: "deal-seed-3", name: "Projet Meridian Bridge — refinancement Vantage Industrial", stage: "Négociation",
        valuation: 320, synergies: 8, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Refinancement de la dette senior de Vantage Industrial Holdings.",
        ddChecklist: [{ item: "Audit financier", done: true }, { item: "Audit juridique", done: true }],
        icVote: [{ item: "Validation Risques", done: true }, { item: "Validation Juridique", done: true }, { item: "Validation Board Of Directors", done: false }],
        createdByPlayerId: null, updatedAt: now - 2 * 86400000, revenueBooked: false, workflow: null
      },
      {
        id: "deal-seed-4", name: "Projet Zenith — cession d'activité Cascade Energy", stage: "Signing",
        valuation: 275, synergies: 0, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Cession de la branche midstream de Cascade Energy Partners.",
        ddChecklist: [{ item: "Audit financier", done: true }, { item: "Audit juridique", done: true }],
        icVote: [{ item: "Validation Risques", done: true }, { item: "Validation Juridique", done: true }, { item: "Validation Board Of Directors", done: true }],
        createdByPlayerId: null, updatedAt: now - 1 * 86400000, revenueBooked: false, workflow: null
      },
      {
        id: "deal-seed-5", name: "Projet Atlas Legacy — acquisition Solstice Pension add-on", stage: "Clôturé",
        valuation: 380, synergies: 15, leadBankerPlayerId: null, leadBankerName: "Équipe historique",
        description: "Opération clôturée sous la direction précédente — fait partie du palmarès repris.",
        ddChecklist: [{ item: "Audit financier", done: true }, { item: "Audit juridique", done: true }],
        icVote: [{ item: "Validation Risques", done: true }, { item: "Validation Juridique", done: true }, { item: "Validation Board Of Directors", done: true }],
        createdByPlayerId: null, updatedAt: now - 60 * 86400000, revenueBooked: true, workflow: null
      },
      {
        id: "deal-seed-6", name: "Projet Compass — introduction en bourse Northbridge Retail", stage: "Clôturé",
        valuation: 510, synergies: 0, leadBankerPlayerId: null, leadBankerName: "Équipe historique",
        description: "Opération clôturée sous la direction précédente — fait partie du palmarès repris.",
        ddChecklist: [{ item: "Audit financier", done: true }, { item: "Audit juridique", done: true }],
        icVote: [{ item: "Validation Risques", done: true }, { item: "Validation Juridique", done: true }, { item: "Validation Board Of Directors", done: true }],
        createdByPlayerId: null, updatedAt: now - 35 * 86400000, revenueBooked: true, workflow: null
      },
      {
        id: "deal-seed-7", name: "Projet Nimbus — levée de fonds Aurora Biotech", stage: "Screening",
        valuation: 190, synergies: 0, leadBankerPlayerId: null, leadBankerName: "Poste vacant",
        description: "Étude préliminaire d'une levée de série C pour Aurora Biotech Ventures.",
        ddChecklist: [{ item: "Étude de faisabilité marché", done: false }, { item: "Revue de conformité préalable", done: false }],
        icVote: [{ item: "Validation Risques", done: false }, { item: "Validation Juridique", done: false }, { item: "Validation Board Of Directors", done: false }],
        createdByPlayerId: null, updatedAt: now, revenueBooked: false, workflow: null
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
      // Board Of Directors inherits a cost structure already running over, a
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
        { dept: "Board Of Directors", budget: 35, actual: 33 }
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
      tradeLog: [],
      darkPoolOrders: []
    },
    directive: null,
    liveEvents: [],
    executedWorkflows: [],
    teamChat: [],
    healthAlertSent: false,
    // League table seeded with the two deals already closed under the prior
    // direction (server/gameState.js's deal-seed-5/6) — Blackwell & Co isn't
    // starting the league table from zero any more than it starts the bank itself
    // from zero. Rival banks (same names Patch 12's stalled-deal AI competes as)
    // start blank and only grow when they actually win a deal away from the player.
    leagueTable: {
      "Blackwell & Co Capital": { isPlayer: true, pnl: 7.1, dealsClosed: 2 },
      "Ashford & Vane": { isPlayer: false, pnl: 0, dealsClosed: 0 },
      "Northfield Partners": { isPlayer: false, pnl: 0, dealsClosed: 0 },
      "Meridian Capital Group": { isPlayer: false, pnl: 0, dealsClosed: 0 },
      "Solenne & Rocher": { isPlayer: false, pnl: 0, dealsClosed: 0 },
      "Ironhall Securities": { isPlayer: false, pnl: 0, dealsClosed: 0 }
    },
    marketDay: {
      dayNumber: 1,
      deadline: null,
      dayStartNetIncome: 108,
      dayStartScores: {},
      dayStartLeagueTable: { "Blackwell & Co Capital": 7.1, "Ashford & Vane": 0, "Northfield Partners": 0, "Meridian Capital Group": 0, "Solenne & Rocher": 0, "Ironhall Securities": 0 }
    },
    // Rating Agency (server/ratingAgency.js) -- one entry per bank in leagueTable,
    // recomputed at every market day settlement. Blackwell & Co's own rating is a
    // real solvency/liquidity calculation off financeKPIs/markets; rival banks get a
    // lighter pnl-trend nudge, consistent with how they're NPC/flavor entities
    // everywhere else (rivalTalent, league table).
    creditRatings: {
      "Blackwell & Co Capital": { rating: "BBB", solvencyRatio: 12.4, liquidityRatio: 5.5, updatedAt: now },
      "Ashford & Vane": { rating: "A", solvencyRatio: null, liquidityRatio: null, updatedAt: now },
      "Northfield Partners": { rating: "A", solvencyRatio: null, liquidityRatio: null, updatedAt: now },
      "Meridian Capital Group": { rating: "A", solvencyRatio: null, liquidityRatio: null, updatedAt: now },
      "Solenne & Rocher": { rating: "A", solvencyRatio: null, liquidityRatio: null, updatedAt: now },
      "Ironhall Securities": { rating: "A", solvencyRatio: null, liquidityRatio: null, updatedAt: now }
    },
    warRoom: null,
    // Mercato Inter-Banques — a lightweight NPC talent pool per rival bank (same 5
    // names as the league table / Patch 12's stalled-deal competitors), browsable
    // by HR/Direction to make poaching offers against. Not simulated employees
    // doing real work elsewhere — just enough to make the mercato mechanic real.
    // loyalty (0-100): below 40, server/mercato.js's HR-2 loyalty-gated flow lets
    // an offer near-instantly land, opening a 60s window for the origin bank to
    // counter, instead of the flat probabilistic roll used at/above 40.
    rivalTalent: {
      "Ashford & Vane": [
        { id: "rt1", name: "Julien Ferrand", role: "Head of Trading", skillRating: 82, currentSalary: 18, loyalty: 62 },
        { id: "rt2", name: "Camille Roussel", role: "Senior M&A Banker", skillRating: 75, currentSalary: 14, loyalty: 32 }
      ],
      "Northfield Partners": [
        { id: "rt3", name: "Léa Berthier", role: "Head of Risk", skillRating: 78, currentSalary: 16, loyalty: 58 },
        { id: "rt4", name: "Nicolas Vasseur", role: "Wealth Relationship Manager", skillRating: 70, currentSalary: 12, loyalty: 28 }
      ],
      "Meridian Capital Group": [
        { id: "rt5", name: "Sofia Marchetti", role: "Quant Trader", skillRating: 85, currentSalary: 19, loyalty: 70 },
        { id: "rt6", name: "Antoine Lucchesi", role: "Compliance Officer", skillRating: 68, currentSalary: 11, loyalty: 35 }
      ],
      "Solenne & Rocher": [
        { id: "rt7", name: "Manon Delcroix", role: "M&A Director", skillRating: 88, currentSalary: 22, loyalty: 66 },
        { id: "rt8", name: "Hugo Fabre", role: "HR Business Partner", skillRating: 65, currentSalary: 10, loyalty: 25 }
      ],
      "Ironhall Securities": [
        { id: "rt9", name: "Chloé Renard", role: "Structuring Specialist", skillRating: 80, currentSalary: 17, loyalty: 54 },
        { id: "rt10", name: "Mathieu Blanchard", role: "Sales Trader", skillRating: 72, currentSalary: 13, loyalty: 38 }
      ]
    },
    mercatoOffers: [],
    cibBonusPool: { available: 0, periodNumber: 1, distributedLog: [] },
    cibLeadership: { holderPlayerId: null, holderName: null, consecutiveBadCycles: 0, appointedAt: null },
    pitchbookCompetitions: [],
    hedgingRequests: [],
    structuredProducts: [],
    rfqRequests: [],
    pendingHedges: [],
    sessionEnded: false,
    sessionHistory: [],
    trophies: null,
    repoStatus: { blocked: false, blockedSince: null, emergencyFacilityUsed: 0 },
    marginCall: { active: false, deadline: null, requiredAmount: 0 },
    ipo: null,
    // Terminal Chat -- distinct from Mail (formal, subject/body inbox): a casual
    // Bloomberg/Slack-style component. "News" reuses gameState.teamChat directly
    // (already aggregates every system's congrats/alert messages) rather than
    // duplicating it; terminalDealsFeed is new ambient AI commentary specifically
    // about deals still in progress (not the closing-moment messages teamChat
    // already covers); terminalDMs are real-time private messages between players.
    terminalDMs: [],
    terminalDealsFeed: [],
    globalBank: seedGlobalBank(),
    aiAgents: seedAiAgents(),
    poachingAttempts: [],
    centralBank: {
      fedRateBps: 425,
      ecbRateBps: 350,
      lastInflationUS: 3.1,
      lastInflationEU: 2.6,
      lastDecisionAt: null,
      history: []
    },
    stressTest: {
      lastRunAt: null,
      lastResults: [],
      bonusRestrictedUntil: null
    },
    privateBanking: { familyOffices: [] },
    algoBots: [],
    algoInfrastructure: { latencyTier: 0, investedTotal: 0 },
    hostileTakeovers: []
  };
  state.maDeals.forEach(d => { if (!d.dataRoom) d.dataRoom = seedDataRoom(d.valuation); });
  return state;
}

const MAX_ACTIVITY_LOG = 200;

function pushActivity(gameState, entry) {
  gameState.activityLog.unshift({ ts: Date.now(), ...entry });
  if (gameState.activityLog.length > MAX_ACTIVITY_LOG) {
    gameState.activityLog.length = MAX_ACTIVITY_LOG;
  }
}

const MAX_TEAM_CHAT = 30;

// Distinct from pushActivity's factual log — proactive AI reactions (congrats on a
// big deal, alerts on bank health) meant to read as a team chat, not a system log.
// Same convention as pushActivity: callers broadcast "teamChat:update" themselves.
function postTeamChat(gameState, entry) {
  gameState.teamChat.unshift({ ts: Date.now(), ...entry });
  if (gameState.teamChat.length > MAX_TEAM_CHAT) {
    gameState.teamChat.length = MAX_TEAM_CHAT;
  }
}

// League table update — same "pure state mutation, caller broadcasts" convention
// as pushActivity/postTeamChat. Used both for Blackwell & Co's own real activity
// (M&A closings, executed workflow deals, markets P&L) and for a rival bank when
// server/handlers/ma.js's stalled-deal sweep has one of them win a deal away.
function recordBankPnl(gameState, bankName, pnlDelta, dealsClosedDelta) {
  const entry = gameState.leagueTable[bankName];
  if (!entry) return;
  entry.pnl = Math.round((entry.pnl + pnlDelta) * 10) / 10;
  if (dealsClosedDelta) entry.dealsClosed += dealsClosedDelta;
}

// Rebuilds all business state in place (same object reference, so every module
// that captured `gameState` by reference stays valid) while preserving the
// array of currently-connected players — resetting must not drop live
// Socket.io room memberships or force a reconnect.
function resetGame(gameState) {
  const preservedPlayers = gameState.players;
  const preservedHallOfFame = gameState.hallOfFame || [];
  const preservedSessionHistory = gameState.sessionHistory || [];
  const fresh = createGameState();
  Object.keys(fresh).forEach(key => {
    gameState[key] = fresh[key];
  });
  gameState.players = preservedPlayers;
  gameState.hallOfFame = preservedHallOfFame;
  gameState.sessionHistory = preservedSessionHistory;
  return gameState;
}

const gameState = createGameState();

// Shared, dependency-free roster serialization -- lives here (not in
// server/handlers/join.js) specifically so modules like hr.js and satisfaction.js
// can broadcast roster:update without importing join.js, which would close a
// require cycle (join.js already imports hr.js for hrRosterView).
function buildPublicRoster(gameState) {
  return gameState.players.map(p => ({
    id: p.id,
    fullName: p.fullName,
    grade: p.grade,
    dept: p.dept,
    cluster: p.cluster,
    satisfaction: p.satisfaction,
    baseSalary: p.baseSalary,
    loyalty: p.loyalty,
    stress: p.stress,
    skillRating: p.skillRating,
    onSabbatical: p.onSabbatical,
    onSickLeave: p.onSickLeave,
    raiseRequested: p.raiseRequested,
    onSuspension: p.onSuspension,
    tradingFrozen: p.tradingFrozen
  }));
}

module.exports = { gameState, createGameState, pushActivity, postTeamChat, recordBankPnl, resetGame, buildPublicRoster };
