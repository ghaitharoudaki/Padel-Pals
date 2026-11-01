export interface CrowdSystem {
  update(timeSeconds: number, dt: number, cheering: boolean): void;
}

export function createCrowdSystem(update: CrowdSystem['update']): CrowdSystem {
  return { update };
}
