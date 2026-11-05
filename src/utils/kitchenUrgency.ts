/** Kitchen order colour stages: green under 10 min, amber 10–15 min, red after 15 min. */
export const KITCHEN_AMBER_MIN = 10;
export const KITCHEN_RED_MIN = 15;

export type KitchenUrgency = 'green' | 'orange' | 'red';

export const kitchenUrgency = (elapsedMinutes: number): KitchenUrgency =>
  elapsedMinutes >= KITCHEN_RED_MIN ? 'red' : elapsedMinutes >= KITCHEN_AMBER_MIN ? 'orange' : 'green';
