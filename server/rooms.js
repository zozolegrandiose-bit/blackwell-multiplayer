const { GRADES, DEPARTMENTS } = require("./seedData");
const { getAccessForPosition, hasFullAccess } = require("./departmentAccess");

function slotKey(grade, dept) {
  return grade + "|||" + dept;
}

function isValidPosition(grade, dept) {
  return GRADES.includes(grade) && DEPARTMENTS.includes(dept);
}

function isSlotTaken(gameState, grade, dept) {
  const key = slotKey(grade, dept);
  return gameState.players.some(p => slotKey(p.grade, p.dept) === key);
}

function getTakenSlots(gameState) {
  return gameState.players.map(p => ({ grade: p.grade, dept: p.dept }));
}

let nextPlayerId = 1;

// Synchronous: must not await anything before writing to gameState.players,
// otherwise two near-simultaneous claims for the same slot could both succeed.
function claimSlot(gameState, { socketId, firstName, lastName, grade, dept }) {
  firstName = (firstName || "").trim();
  lastName = (lastName || "").trim();
  if (!firstName || !lastName) {
    return { ok: false, reason: "Prénom et nom requis." };
  }
  if (!isValidPosition(grade, dept)) {
    return { ok: false, reason: "Grade ou département invalide." };
  }
  if (isSlotTaken(gameState, grade, dept)) {
    return { ok: false, reason: "Ce poste est déjà occupé." };
  }

  const player = {
    id: "p" + (nextPlayerId++),
    socketId,
    firstName,
    lastName,
    fullName: firstName + " " + lastName,
    grade,
    dept,
    access: getAccessForPosition(dept, grade),
    hasFullAccess: hasFullAccess(dept, grade),
    joinedAt: Date.now()
  };
  gameState.players.push(player);
  return { ok: true, player };
}

function releaseSlotBySocketId(gameState, socketId) {
  const idx = gameState.players.findIndex(p => p.socketId === socketId);
  if (idx === -1) return null;
  const [removed] = gameState.players.splice(idx, 1);
  return removed;
}

module.exports = { slotKey, isValidPosition, isSlotTaken, getTakenSlots, claimSlot, releaseSlotBySocketId };
