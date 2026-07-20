import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { BotPersonality, SimulationSettings } from '@aviator/shared';
import { LiveRoundState } from './game-engine.service';

export interface SimPlayerRuntime {
  id: string;
  name: string;
  avatarHue: number;
  personality: BotPersonality;
  betAmount: number;
  cashOutAt: number | null;
  cashedOut: boolean;
  cashOutMultiplier: number | null;
}

export interface SimPlayerAction {
  playerId: string;
  name: string;
  avatarHue: number;
  type: 'BET' | 'CASH_OUT' | 'BUST';
  amount: number;
  multiplier: number | null;
}

@Injectable()
export class SimulatedPlayersService implements OnModuleInit {
  private readonly logger = new Logger(SimulatedPlayersService.name);
  private roster: Array<{
    id: string;
    name: string;
    avatarHue: number;
    active: boolean;
    personality: string;
  }> = [];
  private active: SimPlayerRuntime[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.roster = await this.prisma.simulatedPlayer.findMany({
        where: { active: true },
        select: { id: true, name: true, avatarHue: true, active: true, personality: true },
      });
    } catch {
      this.roster = [];
      this.logger.warn('Could not load simulated players');
    }
  }

  getActive(): SimPlayerRuntime[] {
    return this.active.map((p) => ({ ...p }));
  }

  private pickCashOut(
    personality: BotPersonality,
    crashPoint: number,
  ): number | null {
    const roll = Math.random();
    const clamp = (n: number) => Math.round(Math.min(n, crashPoint * 0.95) * 100) / 100;

    switch (personality) {
      case 'early':
        if (roll < 0.15) return null; // ride and often bust
        return clamp(1.1 + Math.random() * 0.9); // 1.1–2.0
      case 'moon':
        if (roll < 0.45) return null;
        return clamp(3 + Math.random() * 20);
      case 'balanced':
        if (roll < 0.25) return null;
        return clamp(1.5 + Math.random() * 2.5);
      case 'mixed':
      default: {
        const r = Math.random();
        if (r < 0.3) return clamp(1.2 + Math.random() * 0.8);
        if (r < 0.7) return clamp(1.8 + Math.random() * 2);
        if (r < 0.9) return clamp(4 + Math.random() * 6);
        return null;
      }
    }
  }

  onRoundStart(round: LiveRoundState, settings: SimulationSettings) {
    const min = settings.simulatedPlayersMin;
    const max = settings.simulatedPlayersMax;
    const count = Math.min(
      this.roster.length,
      min + Math.floor(Math.random() * Math.max(1, max - min + 1)),
    );
    const shuffled = [...this.roster].sort(() => Math.random() - 0.5).slice(0, count);
    const globalPersonality = settings.botPersonality;

    this.active = shuffled.map((p) => {
      const personality = (
        globalPersonality === 'mixed'
          ? p.personality || 'mixed'
          : globalPersonality
      ) as BotPersonality;
      const betAmount = Math.round((10 + Math.random() * 490) * 100) / 100;
      const cashOutAt = this.pickCashOut(personality, round.crashPoint);
      return {
        id: p.id,
        name: p.name,
        avatarHue: p.avatarHue,
        personality,
        betAmount,
        cashOutAt,
        cashedOut: false,
        cashOutMultiplier: null,
      };
    });
  }

  onTick(
    round: LiveRoundState,
    multiplier: number,
    emit: (action: SimPlayerAction) => void,
  ) {
    for (const p of this.active) {
      if (p.cashedOut) continue;
      if (p.cashOutAt != null && multiplier >= p.cashOutAt) {
        p.cashedOut = true;
        p.cashOutMultiplier = p.cashOutAt;
        emit({
          playerId: p.id,
          name: p.name,
          avatarHue: p.avatarHue,
          type: 'CASH_OUT',
          amount: p.betAmount,
          multiplier: p.cashOutAt,
        });
        void this.prisma.simulatedPlayer.update({
          where: { id: p.id },
          data: {
            lastBetAmount: p.betAmount,
            lastCashOutAt: p.cashOutAt,
          },
        });
        void this.prisma.roundEvent.create({
          data: {
            roundId: round.id,
            type: 'SIM_PLAYER_CASH_OUT',
            multiplier: p.cashOutAt,
            payload: {
              playerId: p.id,
              name: p.name,
              amount: p.betAmount,
              bot: true,
              personality: p.personality,
            },
          },
        });
      }
    }
  }
}
