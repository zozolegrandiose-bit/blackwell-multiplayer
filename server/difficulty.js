// Single source of truth for difficulty scaling — every self-rescheduling loop
// (tasks, events, strategy quarter length) reads its multiplier from here at each
// tick via gameState.difficulty, rather than gameState storing a redundant copy
// of the numbers (which could drift out of sync with this table).
const DIFFICULTY_LEVELS = ["detente", "standard", "intense"];

const DIFFICULTY_LABELS = {
  detente: "Détente",
  standard: "Standard",
  intense: "Intense"
};

// eventFreq/taskFreq: multiplies spawn delays (>1 = rarer/slower). quarterLength:
// multiplies QUARTER_LENGTH_MS (>1 = longer, more time to decide).
const DIFFICULTY_PRESETS = {
  detente: { eventFreq: 1.6, taskFreq: 1.4, quarterLength: 1.4 },
  standard: { eventFreq: 1, taskFreq: 1, quarterLength: 1 },
  intense: { eventFreq: 0.55, taskFreq: 0.6, quarterLength: 0.75 }
};

function getDifficultyPreset(difficulty) {
  return DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.standard;
}

module.exports = { DIFFICULTY_LEVELS, DIFFICULTY_LABELS, DIFFICULTY_PRESETS, getDifficultyPreset };
