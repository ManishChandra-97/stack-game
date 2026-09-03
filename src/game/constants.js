export const MAX_SCORE = 9_999_999;
export const STARTING_SCORE = 100;
export const BUST_THRESHOLD = 20;
export const DAILY_DECK_SIZE = 60;
export const RISK_STATES = Object.freeze(['favorable', 'calm', 'unstable', 'dangerous', 'chaotic']);
export const LATENT_QUALITY = Object.freeze({ favorable: 86, calm: 68, unstable: 50, dangerous: 29, chaotic: 13 });
export const INITIAL_WEIGHTS = Object.freeze([.20, .30, .25, .16, .09]);
export const STATE_EDGE = Object.freeze({ favorable: .15, calm: .06, unstable: 0, dangerous: -.10, chaotic: -.18 });
export const RISK_TRANSITIONS = Object.freeze({
  favorable: [.42, .27, .18, .09, .04], calm: [.19, .44, .23, .10, .04],
  unstable: [.14, .25, .34, .19, .08], dangerous: [.07, .16, .29, .34, .14], chaotic: [.05, .10, .24, .31, .30]
});
export const OPTIONS = Object.freeze({
  SAFE: { label: 'SAFE', riskClass: 'low', base: .82, edge: 1.35, difficulty: .055, jitter: .025, min: .58, max: .95, gain: .08, gainDifficulty: .025, loss: .18, lossDifficulty: .05 },
  PUSH: { label: 'PUSH', riskClass: 'medium', base: .58, edge: 1.10, difficulty: .08, jitter: .04, min: .28, max: .82, gain: .27, gainDifficulty: .08, loss: .44, lossDifficulty: .08 },
  YOLO: { label: 'YOLO', riskClass: 'high', base: .35, edge: 1.65, difficulty: .105, jitter: .055, min: .10, max: .65, gain: .85, gainDifficulty: .22, loss: .85, lossDifficulty: .08 }
});
