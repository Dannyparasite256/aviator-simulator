import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { GameEngineService } from '../../application/game/game-engine.service';
import { UsersService } from '../users/users.service';
import { BetSlot, PracticeBetRequest } from '@aviator/shared';
import { Decimal } from '@prisma/client/runtime/library';
import { AppLogger } from '../../infrastructure/logging/app-logger.service';
import { PracticeBetStatus } from '@prisma/client';

@Injectable()
export class PracticeService implements OnModuleInit {
  private readonly log = new Logger(PracticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: GameEngineService,
    private readonly users: UsersService,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit() {
    // After restarts, engine memory is empty but DB may still have ACTIVE/QUEUED bets.
    // Refund and close them so players are never stuck.
    await this.refundAndCloseAllOpenBets('server_restart');

    this.engine.on(
      'practice:auto-cashout',
      (payload: {
        userId: string;
        slot: BetSlot;
        bet: { betId: string; amount: number; remainingAmount: number };
        multiplier: number;
      }) => {
        void this.finalizeCashOut(
          payload.userId,
          payload.slot,
          payload.bet.betId,
          payload.multiplier,
          payload.bet.remainingAmount,
          1,
        ).catch((e) => this.log.warn(`auto-cashout failed: ${(e as Error).message}`));
      },
    );

    this.engine.on(
      'practice:bust',
      (payload: {
        userId: string;
        slot: BetSlot;
        bet: { betId: string; remainingAmount: number; amount: number };
      }) => {
        void this.finalizeBust(
          payload.userId,
          payload.bet.betId,
          payload.bet.remainingAmount,
        ).catch((e) => this.log.warn(`bust failed: ${(e as Error).message}`));
      },
    );

    this.engine.on('round:waiting', () => {
      void this.activateQueuedBets().catch((e) =>
        this.log.warn(`activate queue failed: ${(e as Error).message}`),
      );
    });
  }

  /** Close orphan open bets and refund remaining amounts (server recovery). */
  async refundAndCloseAllOpenBets(reason: string) {
    const open = await this.prisma.practiceBet.findMany({
      where: { status: { in: [PracticeBetStatus.ACTIVE, PracticeBetStatus.QUEUED] } },
    });
    for (const bet of open) {
      const refund = Number(bet.remainingAmount);
      if (refund > 0) {
        await this.users.adjustCredits(bet.userId, refund);
      }
      await this.prisma.practiceBet.update({
        where: { id: bet.id },
        data: {
          status: PracticeBetStatus.CANCELLED,
          queued: false,
          remainingAmount: 0,
        },
      });
      this.log.warn(
        `Closed stuck bet ${bet.id} for user ${bet.userId} refund=${refund} (${reason})`,
      );
    }
  }

  /**
   * Remove stale DB bets that no longer match engine memory / current round.
   * Returns true if anything was cleaned.
   */
  async cleanupStaleBetsForUser(userId: string, slot?: BetSlot) {
    const current = this.engine.getCurrentState();
    const open = await this.prisma.practiceBet.findMany({
      where: {
        userId,
        ...(slot != null ? { slot } : {}),
        status: { in: [PracticeBetStatus.ACTIVE, PracticeBetStatus.QUEUED] },
      },
    });

    for (const bet of open) {
      const inEngine = this.engine.getActiveBet(userId, bet.slot as BetSlot);
      const isQueued = bet.status === PracticeBetStatus.QUEUED || bet.queued;
      const sameRound = current && bet.roundId === current.id;

      // Valid if queued (waiting for next) OR active and registered in engine for current round
      if (isQueued && !inEngine) {
        // Still valid queue — keep
        continue;
      }
      if (
        bet.status === PracticeBetStatus.ACTIVE &&
        inEngine &&
        inEngine.betId === bet.id
      ) {
        continue;
      }
      if (
        bet.status === PracticeBetStatus.ACTIVE &&
        sameRound &&
        current &&
        (current.phase === 'WAITING' ||
          current.phase === 'COUNTDOWN' ||
          current.phase === 'FLYING')
      ) {
        // Re-attach to engine if missing (e.g. partial restart)
        if (!inEngine) {
          const user = await this.prisma.user.findUnique({ where: { id: userId } });
          this.engine.registerActiveBet({
            betId: bet.id,
            userId,
            slot: bet.slot as BetSlot,
            amount: Number(bet.amount),
            remainingAmount: Number(bet.remainingAmount),
            autoCashOutAt:
              bet.autoCashOutAt != null ? Number(bet.autoCashOutAt) : null,
            displayName: user?.displayName,
          });
        }
        continue;
      }

      // Stale: round ended, wrong round, or orphan ACTIVE without engine
      const refund =
        bet.status === PracticeBetStatus.QUEUED || !sameRound
          ? Number(bet.remainingAmount)
          : 0;

      // If ACTIVE but round is CRASHED / gone — treat as bust (no refund) unless never started
      let finalRefund = refund;
      if (bet.status === PracticeBetStatus.ACTIVE && bet.roundId) {
        const round = await this.prisma.round.findUnique({
          where: { id: bet.roundId },
        });
        if (!round || round.phase === 'CRASHED') {
          finalRefund = 0; // lost
          await this.prisma.practiceBet.update({
            where: { id: bet.id },
            data: {
              status: PracticeBetStatus.BUSTED,
              remainingAmount: 0,
              queued: false,
              profit: new Decimal(
                Number(bet.partialProfit ?? 0) - Number(bet.remainingAmount),
              ),
            },
          });
          continue;
        }
        // Round still open but not in engine — refund to be safe
        finalRefund = Number(bet.remainingAmount);
      }

      if (finalRefund > 0) {
        await this.users.adjustCredits(userId, finalRefund);
      }
      await this.prisma.practiceBet.update({
        where: { id: bet.id },
        data: {
          status: PracticeBetStatus.CANCELLED,
          remainingAmount: 0,
          queued: false,
        },
      });
      this.engine.clearActiveBet(userId, bet.slot as BetSlot);
    }
  }

  async getActiveBets(userId: string) {
    await this.cleanupStaleBetsForUser(userId);
    const rows = await this.prisma.practiceBet.findMany({
      where: {
        userId,
        status: { in: [PracticeBetStatus.ACTIVE, PracticeBetStatus.QUEUED] },
      },
      orderBy: { slot: 'asc' },
    });
    return rows.map((b) => this.toState(b));
  }

  async placeBet(userId: string, dto: PracticeBetRequest) {
    const slot = (dto.slot === 2 ? 2 : 1) as BetSlot;
    const settings = this.engine.getSettings();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    await this.assertSessionLimits(user);
    await this.cleanupStaleBetsForUser(userId, slot);

    const minBet = Math.max(1, settings.minBet || 1, Number(user.minBet) || 1);
    const maxBet = Math.min(
      settings.maxBet || 100000,
      Number(user.maxBet) || 100000,
    );
    if (dto.amount < minBet || dto.amount > maxBet) {
      throw new BadRequestException(
        `Bet must be between ${minBet} and ${maxBet} virtual credits`,
      );
    }

    const existing = await this.prisma.practiceBet.findFirst({
      where: {
        userId,
        slot,
        status: { in: [PracticeBetStatus.ACTIVE, PracticeBetStatus.QUEUED] },
      },
    });
    if (existing) {
      // Last resort: force-close stuck bet and refund, then continue
      const inEngine = this.engine.getActiveBet(userId, slot);
      if (!inEngine) {
        const refund = Number(existing.remainingAmount);
        if (refund > 0) await this.users.adjustCredits(userId, refund);
        await this.prisma.practiceBet.update({
          where: { id: existing.id },
          data: {
            status: PracticeBetStatus.CANCELLED,
            remainingAmount: 0,
            queued: false,
          },
        });
        this.log.warn(`Force-closed stuck slot ${slot} bet ${existing.id}`);
      } else {
        throw new BadRequestException(
          `Slot ${slot} already has an active bet — cash out or wait for the round to end`,
        );
      }
    }

    // Re-read balance after possible refund
    const fresh = await this.users.me(userId);
    if (fresh.virtualCredits < dto.amount) {
      throw new BadRequestException(
        `Insufficient virtual credits (have ${fresh.virtualCredits}, need ${dto.amount})`,
      );
    }

    const canBetNow = this.engine.canAcceptBets();
    const queue = !canBetNow && (dto.queueIfClosed ?? true);
    if (!canBetNow && !queue) {
      throw new BadRequestException(
        'Bets only accepted during WAITING or COUNTDOWN',
      );
    }

    await this.users.adjustCredits(userId, -dto.amount);
    await this.ensureSessionStarted(userId);

    const state = this.engine.getCurrentState();
    const status = canBetNow ? PracticeBetStatus.ACTIVE : PracticeBetStatus.QUEUED;

    const bet = await this.prisma.practiceBet.create({
      data: {
        userId,
        roundId: canBetNow ? state?.id : null,
        slot,
        amount: new Decimal(dto.amount),
        remainingAmount: new Decimal(dto.amount),
        autoCashOutAt:
          dto.autoCashOutAt != null ? new Decimal(dto.autoCashOutAt) : null,
        status,
        queued: !canBetNow,
      },
    });

    if (canBetNow && state) {
      try {
        this.engine.registerActiveBet({
          betId: bet.id,
          userId,
          slot,
          amount: dto.amount,
          remainingAmount: dto.amount,
          autoCashOutAt: dto.autoCashOutAt ?? null,
          displayName: user.displayName,
        });
      } catch (e) {
        // Rollback bet if phase flipped mid-request
        await this.prisma.practiceBet.update({
          where: { id: bet.id },
          data: { status: PracticeBetStatus.CANCELLED, remainingAmount: 0 },
        });
        await this.users.adjustCredits(userId, dto.amount);
        throw new BadRequestException((e as Error).message);
      }
      await this.prisma.roundEvent.create({
        data: {
          roundId: state.id,
          type: 'PRACTICE_BET',
          payload: {
            userId,
            amount: dto.amount,
            betId: bet.id,
            slot,
            displayName: user.displayName,
          },
        },
      });
      this.engine.emitLive({
        id: bet.id,
        kind: 'user',
        displayName: user.displayName,
        avatarHue: 200,
        slot,
        amount: dto.amount,
        type: 'BET',
        multiplier: null,
        at: Date.now(),
      });
    }

    await this.prisma.analyticsEvent.create({
      data: {
        userId,
        category: 'practice',
        action: canBetNow ? 'bet' : 'queue',
        metadata: { amount: dto.amount, slot, betId: bet.id },
      },
    });

    this.logger.event('practice', canBetNow ? 'bet' : 'queue', {
      userId,
      amount: dto.amount,
      slot,
    });

    const me = await this.users.me(userId);
    return {
      ...this.toState(bet),
      virtualCredits: me.virtualCredits,
    };
  }

  async cancelBet(userId: string, slot: BetSlot) {
    await this.cleanupStaleBetsForUser(userId, slot);
    const bet = await this.prisma.practiceBet.findFirst({
      where: {
        userId,
        slot,
        status: { in: [PracticeBetStatus.ACTIVE, PracticeBetStatus.QUEUED] },
      },
    });
    if (!bet) throw new BadRequestException('No cancellable bet on this slot');

    const phase = this.engine.getCurrentState()?.phase;
    if (bet.status === PracticeBetStatus.ACTIVE && phase === 'FLYING') {
      throw new BadRequestException(
        'Cannot cancel after takeoff — cash out instead',
      );
    }

    const refund = Number(bet.remainingAmount);
    await this.prisma.practiceBet.update({
      where: { id: bet.id },
      data: { status: PracticeBetStatus.CANCELLED, queued: false, remainingAmount: 0 },
    });
    this.engine.clearActiveBet(userId, slot);
    await this.users.adjustCredits(userId, refund);

    if (bet.roundId) {
      await this.prisma.roundEvent.create({
        data: {
          roundId: bet.roundId,
          type: 'PRACTICE_CANCEL',
          payload: { userId, slot, amount: refund, betId: bet.id },
        },
      });
    }

    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    this.engine.emitLive({
      id: bet.id,
      kind: 'user',
      displayName: u?.displayName ?? 'Player',
      avatarHue: 200,
      slot,
      amount: refund,
      type: 'CANCEL',
      multiplier: null,
      at: Date.now(),
    });

    return {
      ok: true,
      refunded: refund,
      virtualCredits: (await this.users.me(userId)).virtualCredits,
    };
  }

  async cashOut(userId: string, slot: BetSlot = 1, fraction = 1) {
    let live = this.engine.getActiveBet(userId, slot);

    // Recover: DB says ACTIVE but engine lost the bet (restart mid-round)
    if (!live) {
      const dbBet = await this.prisma.practiceBet.findFirst({
        where: {
          userId,
          slot,
          status: PracticeBetStatus.ACTIVE,
          cashedOut: false,
        },
      });
      const state = this.engine.getCurrentState();
      if (
        dbBet &&
        state?.phase === 'FLYING' &&
        dbBet.roundId === state.id
      ) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        this.engine.registerActiveBet(
          {
            betId: dbBet.id,
            userId,
            slot,
            amount: Number(dbBet.amount),
            remainingAmount: Number(dbBet.remainingAmount),
            autoCashOutAt:
              dbBet.autoCashOutAt != null ? Number(dbBet.autoCashOutAt) : null,
            displayName: user?.displayName,
          },
          { allowFlying: true, silent: true },
        );
        live = this.engine.getActiveBet(userId, slot);
      }
    }

    if (!live) {
      throw new BadRequestException(
        `No active practice bet on slot ${slot} — wait for next round or place a new bet`,
      );
    }
    if (!this.engine.isFlying()) {
      throw new BadRequestException('Cash out only while aircraft is flying');
    }
    const settings = this.engine.getSettings();
    if (fraction < 1 && !settings.allowPartialCashOut) {
      throw new BadRequestException('Partial cash-out disabled');
    }
    fraction = Math.min(1, Math.max(0.1, fraction));
    const mult = this.engine.getCurrentState()!.multiplier;

    if (fraction >= 0.999) {
      this.engine.clearActiveBet(userId, slot);
      return this.finalizeCashOut(
        userId,
        slot,
        live.betId,
        mult,
        live.remainingAmount,
        1,
      );
    }

    const cashAmount = Math.round(live.remainingAmount * fraction * 100) / 100;
    const remain = Math.round((live.remainingAmount - cashAmount) * 100) / 100;
    const result = await this.finalizeCashOut(
      userId,
      slot,
      live.betId,
      mult,
      cashAmount,
      fraction,
      true,
    );
    if (remain > 0) {
      this.engine.updateActiveBet(userId, slot, { remainingAmount: remain });
      await this.prisma.practiceBet.update({
        where: { id: live.betId },
        data: {
          remainingAmount: new Decimal(remain),
          status: PracticeBetStatus.ACTIVE,
          cashedOut: false,
        },
      });
    } else {
      this.engine.clearActiveBet(userId, slot);
    }
    return result;
  }

  private async finalizeCashOut(
    userId: string,
    slot: BetSlot,
    betId: string,
    multiplier: number,
    amount: number,
    fraction: number,
    isPartial = false,
  ) {
    const settings = this.engine.getSettings();
    let payout = Math.round(amount * multiplier * 100) / 100;
    const rawProfit = Math.round((payout - amount) * 100) / 100;
    if (rawProfit > settings.maxProfitPerBet) {
      payout = amount + settings.maxProfitPerBet;
    }
    const profit = Math.round((payout - amount) * 100) / 100;

    const existing = await this.prisma.practiceBet.findUnique({
      where: { id: betId },
    });
    if (!existing) {
      throw new BadRequestException('Bet not found');
    }
    // Idempotent: already fully cashed
    if (
      existing.status === PracticeBetStatus.CASHED_OUT &&
      existing.cashedOut &&
      !isPartial
    ) {
      const me = await this.users.me(userId);
      return {
        betId,
        slot,
        amount,
        cashedOut: true,
        cashOutMultiplier: Number(existing.cashOutMultiplier ?? multiplier),
        profit: Number(existing.profit ?? 0),
        payout: 0,
        partial: false,
        virtualCredits: me.virtualCredits,
      };
    }

    const partialProfit =
      Number(existing?.partialProfit ?? 0) + (isPartial ? profit : 0);

    await this.prisma.practiceBet.update({
      where: { id: betId },
      data: {
        cashedOut: !isPartial || fraction >= 0.999,
        cashOutMultiplier: new Decimal(multiplier),
        profit: isPartial
          ? new Decimal(partialProfit)
          : new Decimal(profit + Number(existing?.partialProfit ?? 0)),
        partialProfit: new Decimal(partialProfit),
        remainingAmount: isPartial
          ? new Decimal(
              Math.max(0, Number(existing?.remainingAmount ?? amount) - amount),
            )
          : new Decimal(0),
        status:
          isPartial && fraction < 0.999
            ? PracticeBetStatus.ACTIVE
            : PracticeBetStatus.CASHED_OUT,
      },
    });

    await this.users.adjustCredits(userId, payout);
    await this.bumpSessionProfit(userId, profit);
    await this.snapshotBankroll(userId, isPartial ? 'partial_cashout' : 'cashout');

    const state = this.engine.getCurrentState();
    if (state) {
      await this.prisma.roundEvent.create({
        data: {
          roundId: state.id,
          type: isPartial ? 'PRACTICE_PARTIAL_CASH_OUT' : 'PRACTICE_CASH_OUT',
          multiplier,
          payload: { userId, betId, amount, profit, slot, fraction },
        },
      });
    }

    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    this.engine.emitLive({
      id: betId,
      kind: 'user',
      displayName: u?.displayName ?? 'Player',
      avatarHue: 200,
      slot,
      amount,
      type: isPartial ? 'PARTIAL' : 'CASH_OUT',
      multiplier,
      profit,
      at: Date.now(),
    });

    return {
      betId,
      slot,
      amount,
      cashedOut: !isPartial || fraction >= 0.999,
      cashOutMultiplier: multiplier,
      profit,
      payout,
      partial: isPartial,
      remainingAmount: isPartial
        ? Math.max(0, Number(existing?.remainingAmount ?? amount) - amount)
        : 0,
      virtualCredits: (await this.users.me(userId)).virtualCredits,
    };
  }

  private async finalizeBust(
    userId: string,
    betId: string,
    remainingAmount: number,
  ) {
    const existing = await this.prisma.practiceBet.findUnique({
      where: { id: betId },
    });
    if (
      !existing ||
      existing.status === PracticeBetStatus.CASHED_OUT ||
      existing.status === PracticeBetStatus.CANCELLED
    ) {
      return;
    }

    const partial = Number(existing.partialProfit ?? 0);
    const loss =
      remainingAmount > 0
        ? remainingAmount
        : Number(existing.remainingAmount) || Number(existing.amount) || 0;

    // Engine may already have set status=BUSTED; still record profit once
    if (existing.status !== PracticeBetStatus.BUSTED) {
      await this.prisma.practiceBet.update({
        where: { id: betId },
        data: {
          status: PracticeBetStatus.BUSTED,
          cashedOut: false,
          profit: new Decimal(partial - loss),
          remainingAmount: new Decimal(0),
          queued: false,
        },
      });
    } else if (existing.profit == null) {
      await this.prisma.practiceBet.update({
        where: { id: betId },
        data: {
          profit: new Decimal(partial - loss),
          remainingAmount: new Decimal(0),
        },
      });
    } else {
      return; // already fully settled
    }

    await this.bumpSessionProfit(userId, -loss);
    await this.snapshotBankroll(userId, 'bust');
  }

  private async activateQueuedBets() {
    const state = this.engine.getCurrentState();
    if (!state || state.phase !== 'WAITING') return;

    const queued = await this.prisma.practiceBet.findMany({
      where: { status: PracticeBetStatus.QUEUED, queued: true },
      include: { user: { select: { displayName: true } } },
    });

    for (const bet of queued) {
      const clash = this.engine.getActiveBet(bet.userId, bet.slot as BetSlot);
      if (clash) continue;

      await this.prisma.practiceBet.update({
        where: { id: bet.id },
        data: {
          status: PracticeBetStatus.ACTIVE,
          queued: false,
          roundId: state.id,
        },
      });

      try {
        this.engine.registerActiveBet({
          betId: bet.id,
          userId: bet.userId,
          slot: bet.slot as BetSlot,
          amount: Number(bet.amount),
          remainingAmount: Number(bet.remainingAmount),
          autoCashOutAt:
            bet.autoCashOutAt != null ? Number(bet.autoCashOutAt) : null,
          displayName: bet.user.displayName,
        });
      } catch {
        // Put back to queued if registration fails
        await this.prisma.practiceBet.update({
          where: { id: bet.id },
          data: { status: PracticeBetStatus.QUEUED, queued: true },
        });
        continue;
      }

      await this.prisma.roundEvent.create({
        data: {
          roundId: state.id,
          type: 'PRACTICE_BET',
          payload: {
            userId: bet.userId,
            amount: Number(bet.amount),
            betId: bet.id,
            slot: bet.slot,
            fromQueue: true,
          },
        },
      });
    }
  }

  private async assertSessionLimits(user: {
    id: string;
    sessionLossLimit: Decimal | null;
    sessionTimeLimitMin: number | null;
    sessionStartedAt: Date | null;
    sessionProfit: Decimal;
  }) {
    if (
      user.sessionLossLimit != null &&
      Number(user.sessionProfit) <= -Number(user.sessionLossLimit)
    ) {
      throw new BadRequestException(
        'Session loss limit reached. Reset session in Stats.',
      );
    }
    if (user.sessionTimeLimitMin != null && user.sessionStartedAt) {
      const elapsedMin =
        (Date.now() - user.sessionStartedAt.getTime()) / 60000;
      if (elapsedMin >= user.sessionTimeLimitMin) {
        throw new BadRequestException(
          'Session time limit reached. Reset session in Stats.',
        );
      }
    }
  }

  private async ensureSessionStarted(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId, sessionStartedAt: null },
      data: { sessionStartedAt: new Date(), sessionProfit: 0 },
    });
  }

  private async bumpSessionProfit(userId: string, delta: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionProfit: { increment: delta } },
    });
  }

  private async snapshotBankroll(userId: string, note: string) {
    try {
      const me = await this.users.me(userId);
      await this.prisma.bankrollSnapshot.create({
        data: {
          userId,
          bankroll: new Decimal(me.virtualCredits),
          profit: new Decimal(me.sessionProfit),
          note,
        },
      });
    } catch {
      /* non-critical */
    }
  }

  private toState(b: {
    id: string;
    slot: number;
    amount: Decimal;
    remainingAmount: Decimal;
    autoCashOutAt: Decimal | null;
    status: PracticeBetStatus;
    cashedOut: boolean;
    cashOutMultiplier: Decimal | null;
    profit: Decimal | null;
    partialProfit: Decimal;
    queued: boolean;
  }) {
    return {
      betId: b.id,
      slot: b.slot as BetSlot,
      amount: Number(b.amount),
      remainingAmount: Number(b.remainingAmount),
      autoCashOutAt: b.autoCashOutAt != null ? Number(b.autoCashOutAt) : null,
      status: b.status,
      cashedOut: b.cashedOut,
      cashOutMultiplier:
        b.cashOutMultiplier != null ? Number(b.cashOutMultiplier) : null,
      profit: b.profit != null ? Number(b.profit) : null,
      partialProfit: Number(b.partialProfit),
      queued: b.queued,
    };
  }
}
