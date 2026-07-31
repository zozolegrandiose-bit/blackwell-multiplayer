// Per-account player state persistence (Patch 28) -- same honest JSON-file
// tradeoff as server/db.js and server/persistence.js: survives disconnects and
// server restarts within a deployment, wiped on a fresh Render redeploy (new
// disk). Grade/dept/access/baseSalary are NOT stored here -- those are always
// re-derived fresh from the account's assignedDept/assignedGrade/assignedSalary
// (server/db.js) on every (re)connect, so an Admin Panel promotion/transfer or
// an in-game HR promotion (which writes back to the account, see
// server/handlers/hr.js and server/socialClimat.js) always wins. This file only
// carries the "soft" gameplay state that has no other home: mood, onboarding
// progress, and temporary status flags, so a reconnecting player resumes where
// they left off instead of resetting to defaults.
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const RECORDS_FILE = path.join(DATA_DIR, "playerRecords.json");

let records = {};

function loadPlayerRecords() {
  try {
    const raw = fs.readFileSync(RECORDS_FILE, "utf8");
    records = JSON.parse(raw) || {};
  } catch (e) {
    records = {};
  }
}

function savePlayerRecords() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2));
  } catch (e) {
    console.log("Sauvegarde des personnages joueurs impossible (non bloquant) :", e.message);
  }
}

function getPlayerRecord(userId) {
  return records[userId] || null;
}

function savePlayerRecord(player) {
  records[player.userId] = {
    joinedAt: player.joinedAt,
    satisfaction: player.satisfaction,
    stress: player.stress,
    loyalty: player.loyalty,
    skillRating: player.skillRating,
    onboarding: player.onboarding,
    raiseRequested: player.raiseRequested,
    onSabbatical: player.onSabbatical,
    sabbaticalUntil: player.sabbaticalUntil,
    onSickLeave: player.onSickLeave,
    sickLeaveUntil: player.sickLeaveUntil,
    onSuspension: player.onSuspension,
    suspensionUntil: player.suspensionUntil,
    tradingFrozen: player.tradingFrozen,
    tradingFrozenUntil: player.tradingFrozenUntil
  };
  savePlayerRecords();
}

module.exports = { loadPlayerRecords, savePlayerRecords, getPlayerRecord, savePlayerRecord };
