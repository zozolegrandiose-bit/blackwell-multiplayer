// Persistent account store (Patch 25) -- a local JSON file, same honest
// tradeoff already established and accepted for server/persistence.js's game
// history: survives restarts within the same Render deployment, but NOT a
// fresh redeploy (new ephemeral disk, no managed database provisioned). A
// single in-memory `db` object is the source of truth during runtime (same
// convention as gameState.js), written to disk on every mutation.
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "..", "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const BCRYPT_ROUNDS = 10;

const db = { users: [], candidates: [] };
let nextUserId = 1;
let nextCandidateId = 1;

function loadDb() {
  try {
    const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    db.users = Array.isArray(parsed.users) ? parsed.users : [];
    db.candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  } catch (e) {
    db.users = [];
    db.candidates = [];
  }
  nextUserId = db.users.reduce((max, u) => Math.max(max, parseInt(u.id.slice(1), 10) || 0), 0) + 1;
  nextCandidateId = db.candidates.reduce((max, c) => Math.max(max, parseInt(c.id.slice(1), 10) || 0), 0) + 1;
}

function saveDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.log("Sauvegarde des comptes impossible (non bloquant) :", e.message);
  }
}

function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash, ...pub } = user;
  return pub;
}

function findUserByEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  return db.users.find(u => u.email.toLowerCase() === normalized) || null;
}

function findUserById(id) {
  return db.users.find(u => u.id === id) || null;
}

function createUser({ firstName, lastName, email, password, deptRequested, gradeRequested }) {
  if (findUserByEmail(email)) return { ok: false, reason: "Un compte existe déjà avec cet email." };
  if (!password || password.length < 6) return { ok: false, reason: "Le mot de passe doit contenir au moins 6 caractères." };

  const user = {
    id: "u" + (nextUserId++),
    firstName: (firstName || "").trim(),
    lastName: (lastName || "").trim(),
    email: (email || "").trim().toLowerCase(),
    passwordHash: bcrypt.hashSync(password, BCRYPT_ROUNDS),
    deptRequested: (deptRequested || "").trim(),
    gradeRequested: (gradeRequested || "").trim(),
    status: "PENDING_APPROVAL",
    assignedDept: null,
    assignedGrade: null,
    assignedEntity: null,
    assignedSalary: null,
    isSuperAdmin: false,
    createdAt: Date.now(),
    approvedAt: null
  };
  db.users.push(user);
  saveDb();
  return { ok: true, user };
}

function verifyPassword(user, password) {
  return !!user && bcrypt.compareSync(password || "", user.passwordHash);
}

function approveUser(userId, { assignedDept, assignedGrade, assignedEntity, assignedSalary }) {
  const user = findUserById(userId);
  if (!user) return { ok: false, reason: "Compte introuvable." };
  user.status = "APPROVED";
  user.assignedDept = assignedDept;
  user.assignedGrade = assignedGrade;
  user.assignedEntity = assignedEntity;
  user.assignedSalary = Number(assignedSalary) || 0;
  user.approvedAt = Date.now();
  saveDb();
  return { ok: true, user };
}

function rejectUser(userId) {
  const user = findUserById(userId);
  if (!user) return { ok: false, reason: "Compte introuvable." };
  user.status = "REJECTED";
  saveDb();
  return { ok: true, user };
}

function revokeUser(userId) {
  const user = findUserById(userId);
  if (!user) return { ok: false, reason: "Compte introuvable." };
  if (user.isSuperAdmin) return { ok: false, reason: "Impossible de révoquer le Super-Admin." };
  user.status = "REVOKED";
  saveDb();
  return { ok: true, user };
}

function updateUserAssignment(userId, fields) {
  const user = findUserById(userId);
  if (!user) return { ok: false, reason: "Compte introuvable." };
  ["assignedDept", "assignedGrade", "assignedEntity"].forEach(key => {
    if (fields[key] != null) user[key] = fields[key];
  });
  if (fields.assignedSalary != null) user.assignedSalary = Number(fields.assignedSalary) || user.assignedSalary;
  saveDb();
  return { ok: true, user };
}

function listPendingUsers() {
  return db.users.filter(u => u.status === "PENDING_APPROVAL");
}

function listAllUsers() {
  return db.users;
}

function createCandidate({ firstName, lastName, email, phone, educationLevel, coverLetter, jobId, jobTitle, department, entity, city }) {
  const candidate = {
    id: "c" + (nextCandidateId++),
    firstName: (firstName || "").trim(),
    lastName: (lastName || "").trim(),
    email: (email || "").trim().toLowerCase(),
    phone: (phone || "").trim(),
    educationLevel: (educationLevel || "").trim(),
    coverLetter: (coverLetter || "").trim(),
    jobId: jobId || null,
    jobTitle: jobTitle || "",
    department: department || "",
    entity: entity || "",
    city: city || "",
    appliedAt: Date.now(),
    convertedToUserId: null
  };
  db.candidates.push(candidate);
  saveDb();
  return candidate;
}

function listCandidates() {
  return db.candidates;
}

function findCandidateById(id) {
  return db.candidates.find(c => c.id === id) || null;
}

function markCandidateConverted(candidateId, userId) {
  const candidate = findCandidateById(candidateId);
  if (!candidate) return { ok: false, reason: "Candidature introuvable." };
  candidate.convertedToUserId = userId;
  saveDb();
  return { ok: true, candidate };
}

// Called once at boot -- if no Super-Admin exists yet and credentials were
// provided via environment variables, create one directly as APPROVED. Doing
// this via env vars (set in Render's dashboard, not committed to source) is
// the only step in this whole patch that genuinely requires the user to act,
// same spirit as every other deployment step already in their hands.
function ensureSuperAdmin() {
  if (db.users.some(u => u.isSuperAdmin)) return;
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    console.log("Aucun Super-Admin configuré -- définissez SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD sur Render pour en créer un au démarrage.");
    return;
  }
  const user = {
    id: "u" + (nextUserId++),
    firstName: "Super",
    lastName: "Admin",
    email: email.trim().toLowerCase(),
    passwordHash: bcrypt.hashSync(password, BCRYPT_ROUNDS),
    deptRequested: "Board Of Directors",
    gradeRequested: "Chief Executive Officer",
    status: "APPROVED",
    assignedDept: "Board Of Directors",
    assignedGrade: "Chief Executive Officer",
    assignedEntity: "ny",
    assignedSalary: 0,
    isSuperAdmin: true,
    createdAt: Date.now(),
    approvedAt: Date.now()
  };
  db.users.push(user);
  saveDb();
  console.log("Super-Admin créé : " + user.email);
}

module.exports = {
  loadDb, saveDb, toPublicUser,
  findUserByEmail, findUserById, createUser, verifyPassword,
  approveUser, rejectUser, revokeUser, updateUserAssignment, listPendingUsers, listAllUsers,
  createCandidate, listCandidates, findCandidateById, markCandidateConverted,
  ensureSuperAdmin
};
