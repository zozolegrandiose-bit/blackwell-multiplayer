const { GRADES, DEPARTMENTS } = require("./seedData");
const { getAccessForPosition, hasFullAccess, getClusterForPosition } = require("./departmentAccess");
const { ONBOARDING_ITEMS, computeBaseSalary } = require("./handlers/hr");
const { isHeadOfCIB } = require("./cibBonus");
const { isDrhGlobal } = require("./globalBank");
const { getPlayerRecord } = require("./playerRecords");

function isValidPosition(grade, dept) {
  return GRADES.includes(grade) && DEPARTMENTS.includes(dept);
}

// Patch 28: seats are assigned by the Super-Admin (department/grade/salary on
// the account, server/db.js), not freely picked by the player -- replaces the
// old claimSlot() grade+dept free-for-all. Keyed by userId rather than name,
// so an account always resumes the SAME player record instead of creating a
// new one each time it connects.
function autoSeatAccount(gameState, { socketId, accountUser }) {
  const existing = gameState.players.find(p => p.userId === accountUser.id);
  if (existing) {
    // A newer socket for the same account (reconnect/refresh, or a second tab)
    // takes over delivery; the stale socket's eventual "disconnect" won't match
    // this socketId anymore and so won't free the seat out from under it.
    existing.socketId = socketId;
    return { ok: true, player: existing, isNewSession: false };
  }

  const dept = accountUser.assignedDept;
  const grade = accountUser.assignedGrade;
  if (!isValidPosition(grade, dept)) {
    return { ok: false, reason: "Poste non configuré pour ce compte — contactez un administrateur." };
  }

  const persisted = getPlayerRecord(accountUser.id);
  const player = {
    id: "acct" + accountUser.id,
    userId: accountUser.id,
    socketId,
    firstName: accountUser.firstName,
    lastName: accountUser.lastName,
    fullName: accountUser.firstName + " " + accountUser.lastName,
    grade,
    dept,
    access: getAccessForPosition(dept, grade),
    hasFullAccess: hasFullAccess(dept, grade),
    cluster: getClusterForPosition(dept, grade),
    joinedAt: persisted ? persisted.joinedAt : Date.now(),
    satisfaction: persisted ? persisted.satisfaction : 70,
    stress: persisted ? persisted.stress : 0,
    loyalty: persisted ? persisted.loyalty : 60,
    skillRating: persisted ? persisted.skillRating : 50,
    onSabbatical: persisted ? persisted.onSabbatical : false,
    sabbaticalUntil: persisted ? persisted.sabbaticalUntil : null,
    onSickLeave: persisted ? persisted.onSickLeave : false,
    sickLeaveUntil: persisted ? persisted.sickLeaveUntil : null,
    raiseRequested: persisted ? persisted.raiseRequested : false,
    onSuspension: persisted ? persisted.onSuspension : false,
    suspensionUntil: persisted ? persisted.suspensionUntil : null,
    tradingFrozen: persisted ? persisted.tradingFrozen : false,
    tradingFrozenUntil: persisted ? persisted.tradingFrozenUntil : null,
    baseSalary: accountUser.assignedSalary || computeBaseSalary(grade),
    onboarding: persisted && persisted.onboarding ? persisted.onboarding : ONBOARDING_ITEMS.map(item => ({ item, done: false }))
  };
  player.isHeadOfCIB = isHeadOfCIB(player);
  player.isDrhGlobal = isDrhGlobal(player);
  gameState.players.push(player);
  return { ok: true, player, isNewSession: true };
}

function releaseSlotBySocketId(gameState, socketId) {
  const idx = gameState.players.findIndex(p => p.socketId === socketId);
  if (idx === -1) return null;
  const [removed] = gameState.players.splice(idx, 1);
  return removed;
}

module.exports = { isValidPosition, autoSeatAccount, releaseSlotBySocketId };
