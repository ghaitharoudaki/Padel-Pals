export interface NetSystem {
  readonly height: number;
}

export function createNetSystem(height: number): NetSystem {
  return { height };
}
