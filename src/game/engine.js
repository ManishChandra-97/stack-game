import { BUST_THRESHOLD, INITIAL_WEIGHTS, MAX_SCORE, OPTIONS, RISK_STATES, RISK_TRANSITIONS, STATE_EDGE } from './constants.js';
import { weightedPick, uniform } from './rng.js';
import { makeSignals, publicSignals } from './signals.js';
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const difficultyForRound = (roundNumber) => Math.min(1, (roundNumber - 1) / 20);
const round4 = (value) => Math.round(value * 10000) / 10000;
export function createRound(roundNumber, priorState, rng) {
  const difficulty = difficultyForRound(roundNumber); const hiddenState = priorState ? weightedPick(rng, RISK_STATES, RISK_TRANSITIONS[priorState]) : weightedPick(rng, RISK_STATES, INITIAL_WEIGHTS);
  const round = { roundNumber, hiddenState, difficulty };
  for (const [id, option] of Object.entries(OPTIONS)) { round[`${id.toLowerCase()}Probability`] = round4(clamp(option.base + STATE_EDGE[hiddenState] * option.edge - difficulty * option.difficulty + uniform(rng, -option.jitter, option.jitter), option.min, option.max)); round[`${id.toLowerCase()}Gain`] = option.gain + difficulty * option.gainDifficulty; round[`${id.toLowerCase()}Loss`] = option.loss + difficulty * option.lossDifficulty; }
  Object.assign(round, makeSignals(hiddenState, difficulty, rng));
  for (const id of Object.keys(OPTIONS)) round[`${id.toLowerCase()}Roll`] = rng();
  return round;
}
export function publicRound(round) { return { roundNumber: round.roundNumber, signals: publicSignals(round), options: Object.entries(OPTIONS).map(([id, option]) => ({ id, label: option.label, rewardPercent: Math.round(round[`${id.toLowerCase()}Gain`] * 100), riskClass: option.riskClass })) }; }
export function resolveChoice(scoreBefore, round, choice, fallbackRng) { const key = choice.toLowerCase(); const probability = round[`${key}Probability`]; const roll = round[`${key}Roll`] ?? fallbackRng(); const success = roll < probability; const scoreAfter = success ? Math.min(MAX_SCORE, Math.max(0, Math.round(scoreBefore * (1 + round[`${key}Gain`])))) : Math.max(0, Math.round(scoreBefore * (1 - round[`${key}Loss`]))); return { choice, success, scoreBefore, scoreAfter, isBust: scoreAfter <= BUST_THRESHOLD, roll }; }
export function profileForRun({ safeCount = 0, pushCount = 0, yoloCount = 0, status, roundsCompleted }) { const total = safeCount + pushCount + yoloCount || 1; const safeRate = safeCount / total; const yoloRate = yoloCount / total; const banked = status === 'banked'; if (safeRate >= .65 && banked && roundsCompleted <= 5) return 'Risk Analyst'; if (safeRate >= .65 && !banked) return 'Cautious Operator'; if (yoloRate >= .45 && banked) return 'Calculated Menace'; if (yoloRate >= .45 && !banked) return 'Variance Enjoyer'; if (banked && roundsCompleted >= 10 && yoloRate < .45) return 'Stack Architect'; if (pushCount / total >= .5) return 'Signal Chaser'; return 'Adaptive Operator'; }
