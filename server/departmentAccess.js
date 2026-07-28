const { GRADES } = require("./seedData");

// "global" (Global Footprint / World Map Operations) is viewable by everyone,
// like the other universal pages -- the actual entity/capital mutation handlers
// in server/globalBank.js are separately gated to Head of CIB, DRH Global, or
// Board Of Directors, the same split already used elsewhere (e.g. Compliance
// page is universal-ish via cluster D but Kill Switch itself is requireAccess-gated).
const UNIVERSAL_PAGES = ["overview", "mail", "agenda", "documents", "expenses", "reglement", "terminal", "global"];

const CLUSTER_PAGES = {
  A: [...UNIVERSAL_PAGES, "ma", "clients"],
  B: [...UNIVERSAL_PAGES, "clients", "markets"],
  C: [...UNIVERSAL_PAGES, "clients"],
  D: [...UNIVERSAL_PAGES, "compliance"],
  E: [...UNIVERSAL_PAGES, "finance"],
  F: [...UNIVERSAL_PAGES, "hr"],
  G: [...UNIVERSAL_PAGES, "strategy", "ma", "clients", "compliance", "finance", "hr", "markets"]
};

const DEPARTMENT_CLUSTER = {
  "Board Of Directors": "G",

  "Banque d'Investissement": "A",
  "Fusions-Acquisitions (M&A)": "A",
  "Marché des Capitaux Actions (ECM)": "A",
  "Marché des Capitaux Dette (DCM)": "A",
  "Financement à Effet de Levier": "A",
  "Titrisation & Financements Structurés": "A",
  "Financement de Projets & Infrastructures": "A",
  "Marchés Émergents": "A",
  "Couverture Sectorielle": "A",

  "Marchés Financiers": "B",
  "Trading FICC": "B",
  "Dérivés de Taux": "B",
  "Change & Matières Premières": "B",
  "Bureau Actions": "B",
  "Dérivés Actions": "B",
  "Ventes Institutionnelles": "B",
  "Prime Services": "B",
  "Recherche Actions": "B",
  "Recherche Crédit": "B",
  "Stratégie Quantitative & Data": "B",

  "Gestion de Fortune": "C",
  "Gestion d'Actifs": "C",
  "Relations Investisseurs": "C",
  "Marketing & Développement Commercial": "C",
  "Stratégie & Développement": "C",
  "Transformation Digitale & Innovation": "C",
  "Expérience Client": "C",

  "Conformité": "D",
  "Gestion des Risques": "D",
  "Juridique & Réglementaire": "D",
  "Audit Interne": "D",
  "Sécurité Informatique": "D",
  "Secrétariat Général": "D",

  "Trésorerie de Groupe": "E",
  "Contrôle Financier": "E",
  "Opérations": "E",
  "Immobilier & Moyens Généraux": "E",

  "Ressources Humaines": "F",
  "Communication & Affaires Publiques": "F"
};

const MD_INDEX = GRADES.indexOf("Managing Director");

function hasFullAccess(dept, grade) {
  if (dept === "Board Of Directors") return true;
  const gradeIndex = GRADES.indexOf(grade);
  return gradeIndex >= MD_INDEX;
}

// "Comité de Direction" (the Strategy page) is now a strict department gate, not a
// seniority gate: only members of Board Of Directors sit on it, at any grade within
// that department — a Managing Director elsewhere in the bank no longer gets in
// through hasFullAccess. A cluster's quarterly decision still defaults to the
// neutral option if nobody from that department is connected (unchanged, existing
// fallback in server/strategy.js).
function hasStrategyAccess(dept) {
  return dept === "Board Of Directors";
}

function getAccessForPosition(dept, grade) {
  if (hasFullAccess(dept, grade)) {
    const pages = [...CLUSTER_PAGES.G];
    // hasFullAccess also fires for an MD+ grade in ANY department (not just Board Of
    // Directors) -- but the strategy page itself is now a strict department gate
    // (hasStrategyAccess), so that broader grade-based privilege must not smuggle
    // "strategy" back in for someone outside Board Of Directors.
    if (!hasStrategyAccess(dept)) {
      const idx = pages.indexOf("strategy");
      if (idx !== -1) pages.splice(idx, 1);
    }
    return pages;
  }
  const cluster = DEPARTMENT_CLUSTER[dept];
  const basePages = cluster ? [...CLUSTER_PAGES[cluster]] : ["overview", "mail"];
  if (hasStrategyAccess(dept) && !basePages.includes("strategy")) basePages.push("strategy");
  return basePages;
}

// Which cluster letter (A-G) a position represents on the Strategy page — distinct
// from getAccessForPosition, which returns the pages a player can navigate to.
function getClusterForPosition(dept, grade) {
  if (hasFullAccess(dept, grade)) return "G";
  return DEPARTMENT_CLUSTER[dept] || null;
}

module.exports = { DEPARTMENT_CLUSTER, CLUSTER_PAGES, UNIVERSAL_PAGES, hasFullAccess, hasStrategyAccess, getAccessForPosition, getClusterForPosition };
