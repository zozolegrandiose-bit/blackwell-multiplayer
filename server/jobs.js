// Careers page job catalogue (Patch 27) -- public, no auth. The 7 cities here
// are deliberately broader than the 4 real Global Footprint entities used by
// the Admin Panel (Patch 26): a job posting is just flavor text about where a
// role is based, not a live game entity, so it doesn't need the same backing
// mechanics (capital ratio, desks, liquidity) that ny/fra/hk/ldn carry.
const express = require("express");
const { createCandidate } = require("./db");

const CITIES = ["New York", "Londres", "Paris / Francfort (Blackwell SE)", "Hong Kong", "Singapour", "Tokyo", "São Paulo"];
const LEVELS = ["Graduate / Summer Analyst", "Experienced Professional", "Executive / MD"];
const DEPARTMENTS = ["Investment Banking (M&A)", "Global Markets (Trading)", "Risk Management", "HR & Talent", "Technology & AI", "Wealth Management"];

const TITLES = {
  "Investment Banking (M&A)": {
    "Graduate / Summer Analyst": ["Summer Analyst, Investment Banking", "Graduate Analyst, M&A Advisory"],
    "Experienced Professional": ["Associate, M&A Advisory", "Vice President, Corporate Finance", "Director, Debt Advisory"],
    "Executive / MD": ["Managing Director, M&A Coverage", "Head of Restructuring Advisory"]
  },
  "Global Markets (Trading)": {
    "Graduate / Summer Analyst": ["Summer Analyst, Global Markets", "Graduate Trader, FICC"],
    "Experienced Professional": ["Associate, Equity Derivatives Trading", "Vice President, Rates Trading", "Sales-Trader, Institutional Clients"],
    "Executive / MD": ["Managing Director, Head of FX Trading", "Global Head of Equity Execution"]
  },
  "Risk Management": {
    "Graduate / Summer Analyst": ["Graduate Analyst, Market Risk"],
    "Experienced Professional": ["Vice President, Credit Risk", "Associate, Model Validation", "Risk Manager, Counterparty Risk"],
    "Executive / MD": ["Chief Risk Officer, Regional Entity", "Director, Enterprise Risk Strategy"]
  },
  "HR & Talent": {
    "Graduate / Summer Analyst": ["HR Graduate Rotational Programme"],
    "Experienced Professional": ["Talent Acquisition Partner", "Compensation & Benefits Manager"],
    "Executive / MD": ["Regional Head of Human Resources"]
  },
  "Technology & AI": {
    "Graduate / Summer Analyst": ["Graduate Software Engineer", "Summer Analyst, Data & AI"],
    "Experienced Professional": ["Senior Software Engineer, Trading Systems", "Machine Learning Engineer, Quant Platform", "Cloud Infrastructure Engineer"],
    "Executive / MD": ["Head of Engineering, Global Markets Technology"]
  },
  "Wealth Management": {
    "Graduate / Summer Analyst": ["Graduate Analyst, Private Banking"],
    "Experienced Professional": ["Relationship Manager, Family Office Coverage", "Wealth Planner, Private Clients"],
    "Executive / MD": ["Managing Director, Head of Private Banking APAC"]
  }
};

function buildJobPostings() {
  const jobs = [];
  let id = 1;
  DEPARTMENTS.forEach(dept => {
    LEVELS.forEach(level => {
      const titles = TITLES[dept][level] || [];
      titles.forEach((title, i) => {
        const city = CITIES[(id + i) % CITIES.length];
        jobs.push({
          id: "job" + id,
          title,
          department: dept,
          level,
          city,
          description: `Rejoignez notre équipe ${dept} à ${city} en tant que ${title}. Vous évoluerez au sein d'une structure internationale, au contact des plus grands clients institutionnels et corporates de Blackwell & Co Capital.`
        });
        id++;
      });
    });
  });
  return jobs;
}

const JOB_POSTINGS = buildJobPostings();

function registerCareersRoutes(app) {
  const router = express.Router();
  router.use(express.json());

  router.get("/api/jobs", (req, res) => {
    res.json({ jobs: JOB_POSTINGS, options: { cities: CITIES, levels: LEVELS, departments: DEPARTMENTS } });
  });

  router.get("/api/jobs/:id", (req, res) => {
    const job = JOB_POSTINGS.find(j => j.id === req.params.id);
    if (!job) { res.status(404).json({ ok: false, reason: "Offre introuvable." }); return; }
    res.json({ job });
  });

  router.post("/apply", (req, res) => {
    const { firstName, lastName, email, phone, educationLevel, coverLetter, jobId } = req.body || {};
    if (!firstName || !lastName || !email) {
      res.status(400).json({ ok: false, reason: "Nom, prénom et email sont requis." });
      return;
    }
    const job = jobId ? JOB_POSTINGS.find(j => j.id === jobId) : null;
    const candidate = createCandidate({
      firstName, lastName, email, phone, educationLevel, coverLetter,
      jobId: job ? job.id : null,
      jobTitle: job ? job.title : "Candidature spontanée",
      department: job ? job.department : "",
      entity: "",
      city: job ? job.city : ""
    });
    res.json({ ok: true, candidate: { id: candidate.id, jobTitle: candidate.jobTitle } });
  });

  app.use(router);
}

module.exports = { registerCareersRoutes, JOB_POSTINGS, CITIES, LEVELS, DEPARTMENTS };
