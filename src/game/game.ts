import { BallState, GameMode, PlayerState } from './types';
import { getPlayerRoster } from './player';

export interface GameSnapshot {
  mode: GameMode;
  players: PlayerState[];
  ball: BallState;
}

export class Game {
  constructor(
    public readonly mode: GameMode,
    public readonly players: PlayerState[],
    public ball: BallState
  ) {}

  public get roster(): PlayerState[] {
    return getPlayerRoster(this.players);
  }

  public snapshot(): GameSnapshot {
    return { mode: this.mode, players: this.roster, ball: this.ball };
  }
}
