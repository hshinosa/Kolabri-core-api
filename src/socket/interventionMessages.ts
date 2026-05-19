export { INTERVENTION_MESSAGES, QUALITY_INTERVENTIONS } from './data/interventionMessages.data.js';

export function pickRandom<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}
