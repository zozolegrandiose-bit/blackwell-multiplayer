const { GRADES } = require("./seedData");

const UNIVERSAL_PAGES = ["overview", "mail", "agenda", "documents", "expenses", "reglement"];

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
  "Direction Générale": "G",

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
// "Comité de Direction" (the Strategy page) is a real management committee, not an
// open forum — only Director and above sit on it. Direction Générale always has it
// via hasFullAccess below, regardless of grade, since that department IS the
// direction. Below Director, a cluster's quarterly decision just defaults to the
// neutral option (already the existing fallback in server/strategy.js) if nobody
// senior enough is connected — no change needed there.
const DIRECTOR_INDEX = GRADES.indexOf("Director");

function hasFullAccess(dept, grade) {
  if (dept === "Direction Générale") return true;
  const gradeIndex = GRADES.indexOf(grade);
  return gradeIndex >= MD_INDEX;
}

function hasStrategyAccess(dept, grade) {
  if (hasFullAccess(dept, grade)) return true;
  return GRADES.indexOf(grade) >= DIRECTOR_INDEX;
}

function getAccessForPosition(dept, grade) {
  if (hasFullAccess(dept, grade)) return [...CLUSTER_PAGES.G];
  const cluster = DEPARTMENT_CLUSTER[dept];
  const basePages = cluster ? [...CLUSTER_PAGES[cluster]] : ["overview", "mail"];
  if (hasStrategyAccess(dept, grade) && !basePages.includes("strategy")) basePages.push("strategy");
  return basePages;
}

// Which cluster letter (A-G) a position represents on the Strategy page — distinct
// from getAccessForPosition, which returns the pages a player can navigate to.
function getClusterForPosition(dept, grade) {
  if (hasFullAccess(dept, grade)) return "G";
  return DEPARTMENT_CLUSTER[dept] || null;
}

module.exports = { DEPARTMENT_CLUSTER, CLUSTER_PAGES, UNIVERSAL_PAGES, hasFullAccess, hasStrategyAccess, getAccessForPosition, getClusterForPosition };
