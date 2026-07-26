const { advanceRandomDeal } = require("./handlers/ma");
const { addRandomClientNote } = require("./handlers/clients");
const { progressRandomComplianceItem } = require("./handlers/compliance");
const { approveRandomLeaveRequest } = require("./handlers/hr");
const { nudgeOperatingRatio } = require("./handlers/finance");

const AI_ACTOR = { id: null, fullName: "IA — Surveillance automatique" };

const PAGE_ACTIONS = {
  ma: advanceRandomDeal,
  clients: addRandomClientNote,
  compliance: progressRandomComplianceItem,
  hr: approveRandomLeaveRequest,
  finance: nudgeOperatingRatio
};

const DWELL_MS = 2 * 60 * 1000; // page must be vacant this long before AI acts
const MIN_DELAY_MS = 45 * 1000;
const MAX_DELAY_MS = 90 * 1000;

function randomDelay() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

function pageRoomSize(io, page) {
  const room = io.sockets.adapter.rooms.get("access:" + page);
  return room ? room.size : 0;
}

// Pure decision logic, extracted so it's unit-testable without waiting on real timers.
// Given the previous "vacated since" timestamp and the current room size/time, decides
// whether the AI should act this tick, and returns the next vacatedAt to remember.
function evaluateVacancy(vacatedAt, roomSize, now, dwellMs) {
  if (roomSize > 0) return { act: false, vacatedAt: null };
  if (vacatedAt === null) return { act: false, vacatedAt: now };
  if (now - vacatedAt >= dwellMs) return { act: true, vacatedAt: now };
  return { act: false, vacatedAt };
}

// Self-rescheduling per-page loop (not setInterval, to avoid drift accumulation).
// Vacancy is tracked purely within this loop's own ticks (no join/disconnect hooks needed):
// each tick compares the current room size to the previous one, and only acts once a page
// has been continuously empty for at least DWELL_MS.
function schedulePageLoop(io, gameState, page) {
  let vacatedAt = null;

  function tick() {
    const result = evaluateVacancy(vacatedAt, pageRoomSize(io, page), Date.now(), DWELL_MS);
    vacatedAt = result.vacatedAt;
    if (result.act) {
      const action = PAGE_ACTIONS[page];
      if (action) action(io, gameState, AI_ACTOR);
    }
    setTimeout(tick, randomDelay());
  }

  setTimeout(tick, randomDelay());
}

function startAiLoop(io, gameState) {
  if (process.env.AI_ENABLED === "false") {
    console.log("IA ambiante désactivée (AI_ENABLED=false).");
    return;
  }
  Object.keys(PAGE_ACTIONS).forEach(page => schedulePageLoop(io, gameState, page));
  console.log("IA ambiante activée sur les pages : " + Object.keys(PAGE_ACTIONS).join(", "));
}

module.exports = { startAiLoop, AI_ACTOR, PAGE_ACTIONS, DWELL_MS, evaluateVacancy };
