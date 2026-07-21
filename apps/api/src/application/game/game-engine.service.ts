import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import {
  computeMultiplier,
  DEFAULT_SIMULATION_SETTINGS,
  SimulationSettings,
  RoundPhase,
  MultiplierTick,
  CrashPayload,
  SOCKET_EVENTS,
  EDGE_SCENARIOS,
  EdgeScenario,
  LiveBetFeedItem,
} from '@aviator/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { CrashPointGenerator } from '../../domain/game/crash-point.generator';
import { SimulatedPlayersService } from './simulated-players.service';
import { Decimal } from '@prisma/client/runtime/library';

export interface LiveRoundState {
  id: string;
  roundNumber: number;
  phase: RoundPhase;
  crashPoint: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  phaseStartedAt: number;
  flyStartedAt: number | null;
  multiplier: number;
}

export interface EngineBet {
  betId: string;
  userId: string;
  slot: 1 | 2;
  amount: number;
  remainingAmount: number;
  autoCashOutAt: number | null;
  displayName?: string;
}

@Injectable()
export class GameEngineService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameEngineService.name);
  private settings: SimulationSettings = { ...DEFAULT_SIMULATION_SETTINGS };
  private current: LiveRoundState | null = null;
  private timer: NodeJS.Timeout | null = null;
  private tickCounter = 0;
  private ticksWindowStart = Date.now();
  private ticksPerSecond = 0;
  private connectionCount = 0;
  private nonce = 0;
  private masterSeed = CrashPointGenerator.generateServerSeed();
  private roundsSinceSeedRotate = 0;
  /** Global round client seed for server-side fairness (per-round). Users have own seeds for verify UX. */
  private readonly roundClientSeed = 'aviator-sim-round-client';
  private running = false;
  /** Active flying bets keyed by `${userId}:${slot}` */
  private activeBets = new Map<string, EngineBet>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly simPlayers: SimulatedPlayersService,
  ) {
    super();
    this.setMaxListeners(200);
  }

  async onModuleInit() {
    await this.loadSettings();
    this.running = true;
    await this.startNewRound();
    this.scheduleLoop();
    this.logger.log('Game engine started (virtual practice only)');
  }

  onModuleDestroy() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  getSettings(): SimulationSettings {
    return { ...this.settings };
  }

  async updateSettings(partial: Partial<SimulationSettings>, actorId?: string) {
    if (partial.edgeScenario) {
      const scenario = EDGE_SCENARIOS[partial.edgeScenario as EdgeScenario];
      if (scenario) {
        partial = { ...scenario, ...partial };
      }
    }
    this.settings = { ...this.settings, ...partial };
    const settingsJson = { ...this.settings };
    await this.prisma.simulationConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', settings: settingsJson, updatedBy: actorId },
      update: { settings: settingsJson, updatedBy: actorId },
    });
    this.emit(SOCKET_EVENTS.SETTINGS_UPDATE, this.settings);
    return this.settings;
  }

  async applyScenario(scenario: EdgeScenario, actorId?: string) {
    return this.updateSettings({ edgeScenario: scenario, ...EDGE_SCENARIOS[scenario] }, actorId);
  }

  getCurrentState(): LiveRoundState | null {
    return this.current ? { ...this.current } : null;
  }

  getTicksPerSecond(): number {
    return this.ticksPerSecond;
  }

  setConnectionCount(n: number) {
    this.connectionCount = n;
  }

  getConnectionCount(): number {
    return this.connectionCount;
  }

  getMasterSeedHash(): string {
    return CrashPointGenerator.hashSeed(this.masterSeed);
  }

  getMasterSeedForAdmin(): string {
    return this.masterSeed;
  }

  getNextNonce(): number {
    return this.nonce;
  }

  getRoundClientSeed(): string {
    return this.roundClientSeed;
  }

  /**
   * Admin view: current live round (with crash point) + next N rounds.
   * Next rounds use the same deterministic seed chain as startNewRound().
   */
  getAdminRoundForecast(count = 10) {
    const current = this.current;
    const upcoming = CrashPointGenerator.previewUpcoming(
      this.masterSeed,
      this.roundClientSeed,
      this.nonce,
      count,
      this.settings.houseEdgeBps,
      this.settings.minCrashMultiplier,
      this.settings.maxCrashMultiplier,
    ).map((p, i) => ({
      label: i === 0 ? 'NEXT' : `+${i + 1}`,
      roundNumber: (current?.roundNumber ?? 0) + i + 1,
      nonce: p.nonce,
      crashPoint: p.crashPoint,
      serverSeedHash: p.serverSeedHash,
      // Seeds only for admin testing — not shown to players before crash
      serverSeed: p.serverSeed,
      phase: 'UPCOMING' as const,
    }));

    return {
      disclaimer:
        'Admin-only forecast for debugging / testing. Players never see this before crash. Educational simulation only.',
      current: current
        ? {
            label: 'CURRENT',
            id: current.id,
            roundNumber: current.roundNumber,
            phase: current.phase,
            multiplier: current.multiplier,
            crashPoint: current.crashPoint,
            serverSeedHash: current.serverSeedHash,
            serverSeed: current.serverSeed,
            clientSeed: current.clientSeed,
            nonce: current.nonce,
            flyStartedAt: current.flyStartedAt,
            phaseStartedAt: current.phaseStartedAt,
            willCrashAt: current.crashPoint,
          }
        : null,
      next: upcoming[0] ?? null,
      upcoming,
      houseEdgeBps: this.settings.houseEdgeBps,
      growthRate: this.settings.growthRate,
      serverTime: Date.now(),
    };
  }

  previewUpcoming(count = 10) {
    return this.getAdminRoundForecast(count).upcoming.map((p) => ({
      roundNumber: p.roundNumber,
      crashPoint: p.crashPoint,
      serverSeedHash: p.serverSeedHash,
      note: 'Admin preview — educational / automated testing only',
    }));
  }

  betKey(userId: string, slot: 1 | 2) {
    return `${userId}:${slot}`;
  }

  /**
   * Register a bet in the live engine map.
   * @param opts.allowFlying recover cash-out path after process restart mid-round
   * @param opts.silent skip live-feed BET event (recovery)
   */
  registerActiveBet(
    bet: EngineBet,
    opts?: { allowFlying?: boolean; silent?: boolean },
  ) {
    if (!this.current) {
      throw new Error('No active round');
    }
    const phase = this.current.phase;
    const okPhase =
      phase === 'WAITING' ||
      phase === 'COUNTDOWN' ||
      (opts?.allowFlying && phase === 'FLYING');
    if (!okPhase) {
      throw new Error('Bets only accepted during WAITING or COUNTDOWN');
    }
    this.activeBets.set(this.betKey(bet.userId, bet.slot), bet);
    if (!opts?.silent) {
      this.emitLive({
        id: bet.betId,
        kind: 'user',
        userId: bet.userId,
        displayName: bet.displayName ?? 'Player',
        avatarHue: 200,
        slot: bet.slot,
        amount: bet.amount,
        type: 'BET',
        multiplier: null,
        at: Date.now(),
      });
    }
  }

  getActiveBet(userId: string, slot: 1 | 2) {
    return this.activeBets.get(this.betKey(userId, slot));
  }

  getUserActiveBets(userId: string) {
    return [1, 2]
      .map((s) => this.activeBets.get(this.betKey(userId, s as 1 | 2)))
      .filter(Boolean) as EngineBet[];
  }

  clearActiveBet(userId: string, slot: 1 | 2) {
    this.activeBets.delete(this.betKey(userId, slot));
  }

  updateActiveBet(userId: string, slot: 1 | 2, patch: Partial<EngineBet>) {
    const key = this.betKey(userId, slot);
    const cur = this.activeBets.get(key);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.activeBets.set(key, next);
    return next;
  }

  getAllActiveBets() {
    return Array.from(this.activeBets.values());
  }

  emitLive(item: LiveBetFeedItem) {
    this.emit(SOCKET_EVENTS.LIVE_FEED, item);
  }

  canAcceptBets(): boolean {
    return !!this.current && (this.current.phase === 'WAITING' || this.current.phase === 'COUNTDOWN');
  }

  isFlying(): boolean {
    return this.current?.phase === 'FLYING';
  }

  private async loadSettings() {
    try {
      const row = await this.prisma.simulationConfig.findUnique({ where: { id: 'default' } });
      if (row?.settings && typeof row.settings === 'object') {
        this.settings = {
          ...DEFAULT_SIMULATION_SETTINGS,
          ...(row.settings as unknown as SimulationSettings),
        };
      }
      const last = await this.prisma.round.findFirst({ orderBy: { roundNumber: 'desc' } });
      if (last) this.nonce = last.nonce + 1;
    } catch (err) {
      this.logger.warn(`Settings load failed, using defaults: ${(err as Error).message}`);
    }
    const tickMs = this.config.get<number>('GAME_TICK_MS');
    if (tickMs) this.settings.tickMs = Number(tickMs);
  }

  private scheduleLoop() {
    if (!this.running) return;
    const tickMs = Math.max(8, Math.min(50, this.settings.tickMs || 16));
    this.timer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleLoop());
    }, tickMs);
  }

  private async tick() {
    if (!this.current) return;
    const now = Date.now();
    this.tickCounter++;
    if (now - this.ticksWindowStart >= 1000) {
      this.ticksPerSecond = this.tickCounter;
      this.tickCounter = 0;
      this.ticksWindowStart = now;
    }

    const elapsed = now - this.current.phaseStartedAt;

    switch (this.current.phase) {
      case 'WAITING':
        if (elapsed >= this.settings.waitingSeconds * 1000) {
          await this.transition('COUNTDOWN');
        }
        break;
      case 'COUNTDOWN': {
        const remaining = Math.max(0, this.settings.countdownSeconds * 1000 - elapsed);
        this.broadcastTick(remaining);
        if (remaining <= 0) {
          await this.transition('FLYING');
        }
        break;
      }
      case 'FLYING': {
        const flyElapsed = now - (this.current.flyStartedAt ?? now);
        const mult = computeMultiplier(flyElapsed, this.settings.growthRate);
        this.current.multiplier = mult;
        this.broadcastTick();
        this.processAutoCashouts(mult);
        this.simPlayers.onTick(this.current, mult, (action) => {
          this.emit(SOCKET_EVENTS.SIM_PLAYER_ACTION, action);
          this.emitLive({
            id: `${action.playerId}-${Date.now()}`,
            kind: 'bot',
            displayName: action.name,
            avatarHue: action.avatarHue,
            amount: action.amount,
            type: action.type === 'CASH_OUT' ? 'CASH_OUT' : action.type === 'BUST' ? 'BUST' : 'BET',
            multiplier: action.multiplier,
            at: Date.now(),
          });
        });
        if (mult >= this.current.crashPoint) {
          await this.crash();
        }
        break;
      }
      case 'CRASHED':
        if (this.settings.autoRestart && elapsed >= 2500) {
          await this.startNewRound();
        }
        break;
    }

    await this.redis.set('game:current', JSON.stringify(this.publicState()), 30);
  }

  private broadcastTick(countdownRemainingMs?: number) {
    if (!this.current) return;
    const payload: MultiplierTick = {
      roundId: this.current.id,
      roundNumber: this.current.roundNumber,
      phase: this.current.phase,
      multiplier: this.current.multiplier,
      elapsedMs:
        this.current.flyStartedAt != null
          ? Date.now() - this.current.flyStartedAt
          : Date.now() - this.current.phaseStartedAt,
      countdownRemainingMs,
      serverTime: Date.now(),
      flyStartedAt: this.current.flyStartedAt,
      growthRate: this.settings.growthRate,
    };
    this.emit(SOCKET_EVENTS.ROUND_TICK, payload);
  }

  private async transition(phase: RoundPhase) {
    if (!this.current) return;
    this.current.phase = phase;
    this.current.phaseStartedAt = Date.now();
    if (phase === 'FLYING') {
      this.current.flyStartedAt = Date.now();
      this.current.multiplier = 1;
      this.simPlayers.onRoundStart(this.current, this.settings);
    }
    await this.prisma.round.update({
      where: { id: this.current.id },
      data: {
        phase,
        startedAt: phase === 'FLYING' ? new Date() : undefined,
      },
    });
    await this.prisma.roundEvent.create({
      data: {
        roundId: this.current.id,
        type: 'PHASE_CHANGE',
        multiplier: this.current.multiplier,
        payload: { phase },
      },
    });
    this.emit(SOCKET_EVENTS.ROUND_STATE, this.publicState());
    if (phase === 'FLYING') {
      this.emit('round:flying', this.current);
    }
  }

  private processAutoCashouts(mult: number) {
    for (const [key, bet] of this.activeBets.entries()) {
      if (bet.autoCashOutAt != null && mult >= bet.autoCashOutAt) {
        this.emit('practice:auto-cashout', {
          userId: bet.userId,
          slot: bet.slot,
          bet,
          multiplier: bet.autoCashOutAt,
        });
        this.activeBets.delete(key);
      }
    }
  }

  private async crash() {
    if (!this.current || this.current.phase === 'CRASHED') return;
    const crashPoint = this.current.crashPoint;
    this.current.phase = 'CRASHED';
    this.current.phaseStartedAt = Date.now();
    this.current.multiplier = crashPoint;

    const durationMs = this.current.flyStartedAt
      ? Date.now() - this.current.flyStartedAt
      : 0;

    await this.prisma.round.update({
      where: { id: this.current.id },
      data: {
        phase: 'CRASHED',
        crashPoint: new Decimal(crashPoint),
        crashedAt: new Date(),
        durationMs,
        peakMultiplier: new Decimal(crashPoint),
        serverSeed: this.current.serverSeed,
      },
    });

    await this.prisma.roundEvent.create({
      data: {
        roundId: this.current.id,
        type: 'CRASH',
        multiplier: crashPoint,
        payload: {
          crashPoint,
          serverSeed: this.current.serverSeed,
          serverSeedHash: this.current.serverSeedHash,
        },
      },
    });

    // Bust remaining active bets (memory + DB for reliability)
    const remaining = Array.from(this.activeBets.values());
    this.activeBets.clear();

    // Ensure every ACTIVE DB bet on this round is closed even if not in memory
    try {
      await this.prisma.practiceBet.updateMany({
        where: {
          roundId: this.current.id,
          status: 'ACTIVE',
          cashedOut: false,
        },
        data: {
          status: 'BUSTED',
          remainingAmount: 0,
          queued: false,
        },
      });
    } catch (err) {
      this.logger.warn(`DB bust update failed: ${(err as Error).message}`);
    }

    for (const bet of remaining) {
      this.emit('practice:bust', { userId: bet.userId, slot: bet.slot, bet, crashPoint });
      this.emitLive({
        id: bet.betId,
        kind: 'user',
        userId: bet.userId,
        displayName: bet.displayName ?? 'Player',
        avatarHue: 200,
        slot: bet.slot,
        amount: bet.remainingAmount,
        type: 'BUST',
        multiplier: crashPoint,
        at: Date.now(),
      });
    }

    const payload: CrashPayload = {
      roundId: this.current.id,
      roundNumber: this.current.roundNumber,
      crashPoint,
      serverSeed: this.current.serverSeed,
      serverSeedHash: this.current.serverSeedHash,
      clientSeed: this.current.clientSeed,
      nonce: this.current.nonce,
      serverTime: Date.now(),
    };
    this.emit(SOCKET_EVENTS.ROUND_CRASH, payload);
    this.emit(SOCKET_EVENTS.ROUND_STATE, this.publicState());
    this.logger.debug(`Round #${this.current.roundNumber} crashed @ ${crashPoint}x`);
  }

  private async startNewRound() {
    // Seed rotation
    this.roundsSinceSeedRotate++;
    if (this.roundsSinceSeedRotate >= (this.settings.seedRotateEveryNRounds || 100)) {
      this.masterSeed = CrashPointGenerator.generateServerSeed();
      this.roundsSinceSeedRotate = 0;
      this.logger.log('Master seed rotated (educational fairness demo)');
    }

    // Deterministic per-round seed from master chain (admin can preview accurately)
    const nonce = this.nonce++;
    const serverSeed = CrashPointGenerator.deriveRoundServerSeed(this.masterSeed, nonce);
    const serverSeedHash = CrashPointGenerator.hashSeed(serverSeed);
    const crashPoint = CrashPointGenerator.computeCrashPoint(
      serverSeed,
      this.roundClientSeed,
      nonce,
      this.settings.houseEdgeBps,
      this.settings.minCrashMultiplier,
      this.settings.maxCrashMultiplier,
    );

    const round = await this.prisma.round.create({
      data: {
        phase: 'WAITING',
        // Commit only: store hash in serverSeed field until crash unless debug
        serverSeed: this.settings.debugMode ? serverSeed : serverSeedHash,
        serverSeedHash,
        clientSeed: this.roundClientSeed,
        nonce,
        crashPoint: this.settings.debugMode ? new Decimal(crashPoint) : null,
      },
    });

    this.current = {
      id: round.id,
      roundNumber: round.roundNumber,
      phase: 'WAITING',
      crashPoint,
      serverSeed,
      serverSeedHash,
      clientSeed: this.roundClientSeed,
      nonce,
      phaseStartedAt: Date.now(),
      flyStartedAt: null,
      multiplier: 1,
    };

    this.activeBets.clear();
    this.emit(SOCKET_EVENTS.ROUND_STATE, this.publicState());
    this.emit('round:waiting', this.current);
    this.logger.debug(`Round #${round.roundNumber} started (hash ${serverSeedHash.slice(0, 8)}…)`);
  }

  publicState() {
    if (!this.current) return null;
    return {
      id: this.current.id,
      roundNumber: this.current.roundNumber,
      phase: this.current.phase,
      multiplier: this.current.multiplier,
      serverSeedHash: this.current.serverSeedHash,
      clientSeed: this.current.clientSeed,
      nonce: this.current.nonce,
      crashPoint:
        this.current.phase === 'CRASHED' || this.settings.debugMode
          ? this.current.crashPoint
          : null,
      serverSeed:
        this.current.phase === 'CRASHED' || this.settings.debugMode
          ? this.current.serverSeed
          : null,
      flyStartedAt: this.current.flyStartedAt,
      phaseStartedAt: this.current.phaseStartedAt,
      serverTime: Date.now(),
      growthRate: this.settings.growthRate,
      settings: {
        countdownSeconds: this.settings.countdownSeconds,
        waitingSeconds: this.settings.waitingSeconds,
        targetFps: this.settings.targetFps,
        debugMode: this.settings.debugMode,
        minBet: this.settings.minBet,
        maxBet: this.settings.maxBet,
        maxProfitPerBet: this.settings.maxProfitPerBet,
        allowPartialCashOut: this.settings.allowPartialCashOut,
        houseEdgeBps: this.settings.houseEdgeBps,
        edgeScenario: this.settings.edgeScenario,
        growthRate: this.settings.growthRate,
      },
    };
  }
}
