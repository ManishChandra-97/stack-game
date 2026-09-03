import { LATENT_QUALITY } from './constants.js';
import { uniform } from './rng.js';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function makeSignals(riskState, difficulty, rng) {
  const quality = LATENT_QUALITY[riskState]; const signalNoise = 12 + difficulty * 10; const volatilityNoise = 11 + difficulty * 12;
  const signalStrength = clamp(Math.round(quality + uniform(rng, -signalNoise, signalNoise) - difficulty * 5), 0, 100);
  const volatility = clamp(Math.round((100 - quality) + uniform(rng, -volatilityNoise, volatilityNoise) + difficulty * 8), 0, 100);
  const upChance = clamp(.15 + quality / 100 * .65 - difficulty * .08, .10, .85);
  const trend = Array.from({ length: 5 }, () => rng() < upChance ? 'up' : 'down');
  const riskValue = volatility - signalStrength * .25 + uniform(rng, -7, 7);
  return { signalStrength, volatility, trend, riskIndicator: riskValue < 24 ? 'LOW' : riskValue < 51 ? 'MEDIUM' : 'HIGH' };
}
export function publicSignals(signals) { return { signalBars: Math.ceil(signals.signalStrength / 10), volatilityBars: Math.ceil(signals.volatility / 10), trend: signals.trend, riskIndicator: signals.riskIndicator }; }
