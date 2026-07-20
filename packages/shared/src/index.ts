/** Shared contracts for Aviator crash simulator (educational use only). */

export type UserRole = 'USER' | 'ADMIN';

export type RoundPhase = 'WAITING' | 'COUNTDOWN' | 'FLYING' | 'CRASHED';

export type BetSlot = 1 | 2;

export type PracticeBetStatus =
  | 'QUEUED'
  | 'ACTIVE'
  | 'CASHED_OUT'
  | 'BUSTED'
  | 'CANCELLED';

export type BotPersonality = 'early' | 'balanced' | 'moon' | 'mixed';

export type EdgeScenario = 'low' | 'standard' | 'high' | 'long_tail';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  virtualCredits: number;
  preferredCurrency: string;
  clientSeed: string;
  minBet: number;
  maxBet: number;
  maxProfitPerBet: number;
  sessionLossLimit: number | null;
  sessionTimeLimitMin: number | null;
  sessionStartedAt: string | null;
  sessionProfit: number;
  createdAt: string;
}

export type WalletRequestType = 'DEPOSIT' | 'WITHDRAW';
export type WalletRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  rateToVc: number;
  decimals: number;
  balanceInCurrency?: number;
}

export interface WalletRequest {
  id: string;
  type: WalletRequestType;
  status: WalletRequestStatus;
  currencyCode: string;
  amountCurrency: number;
  amountVc: number;
  note: string | null;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  disclaimer?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface SimulationSettings {
  countdownSeconds: number;
  waitingSeconds: number;
  minCrashMultiplier: number;
  maxCrashMultiplier: number;
  /** House edge in basis points. 100 = 1%, 300 = 3%. Applied once in crash formula. */
  houseEdgeBps: number;
  tickMs: number;
  targetFps: number;
  simulatedPlayersMin: number;
  simulatedPlayersMax: number;
  debugMode: boolean;
  autoRestart: boolean;
  practiceDefaultBet: number;
  minBet: number;
  maxBet: number;
  maxProfitPerBet: number;
  allowPartialCashOut: boolean;
  seedRotateEveryNRounds: number;
  botPersonality: BotPersonality;
  edgeScenario: EdgeScenario;
  growthRate: number;
}

export const DEFAULT_SIMULATION_SETTINGS: SimulationSettings = {
  countdownSeconds: 5,
  waitingSeconds: 5,
  minCrashMultiplier: 1.0,
  maxCrashMultiplier: 1000,
  houseEdgeBps: 300,
  tickMs: 16,
  targetFps: 144,
  simulatedPlayersMin: 8,
  simulatedPlayersMax: 40,
  debugMode: false,
  autoRestart: true,
  practiceDefaultBet: 100,
  minBet: 1,
  maxBet: 100_000,
  maxProfitPerBet: 1_000_000,
  allowPartialCashOut: true,
  seedRotateEveryNRounds: 100,
  botPersonality: 'mixed',
  edgeScenario: 'standard',
  growthRate: 0.06,
};

export const EDGE_SCENARIOS: Record<
  EdgeScenario,
  Pick<SimulationSettings, 'houseEdgeBps' | 'maxCrashMultiplier' | 'growthRate'>
> = {
  low: { houseEdgeBps: 100, maxCrashMultiplier: 1000, growthRate: 0.06 },
  standard: { houseEdgeBps: 300, maxCrashMultiplier: 1000, growthRate: 0.06 },
  high: { houseEdgeBps: 500, maxCrashMultiplier: 500, growthRate: 0.055 },
  long_tail: { houseEdgeBps: 200, maxCrashMultiplier: 10000, growthRate: 0.05 },
};

export interface RoundSummary {
  id: string;
  roundNumber: number;
  phase: RoundPhase;
  crashPoint: number | null;
  startedAt: string | null;
  crashedAt: string | null;
  serverSeedHash: string;
  createdAt: string;
}

export interface RoundDetail extends RoundSummary {
  serverSeed: string | null;
  clientSeed: string;
  nonce: number;
  durationMs: number | null;
  peakMultiplier: number | null;
  events: RoundEvent[];
}

export type RoundEventType =
  | 'PHASE_CHANGE'
  | 'MULTIPLIER_TICK'
  | 'CRASH'
  | 'SIM_PLAYER_CASH_OUT'
  | 'PRACTICE_BET'
  | 'PRACTICE_CASH_OUT'
  | 'PRACTICE_PARTIAL_CASH_OUT'
  | 'PRACTICE_CANCEL'
  | 'LIVE_BET';

export interface RoundEvent {
  id: string;
  type: RoundEventType;
  multiplier: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface MultiplierTick {
  roundId: string;
  roundNumber: number;
  phase: RoundPhase;
  multiplier: number;
  elapsedMs: number;
  countdownRemainingMs?: number;
  serverTime: number;
  flyStartedAt: number | null;
  growthRate: number;
}

export interface CrashPayload {
  roundId: string;
  roundNumber: number;
  crashPoint: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  serverTime: number;
}

export interface PracticeBetRequest {
  amount: number;
  slot: BetSlot;
  autoCashOutAt?: number | null;
  /** Queue for next round if current is FLYING/CRASHED */
  queueIfClosed?: boolean;
}

export interface PracticeBetState {
  betId: string;
  slot: BetSlot;
  amount: number;
  remainingAmount: number;
  autoCashOutAt: number | null;
  status: PracticeBetStatus;
  cashedOut: boolean;
  cashOutMultiplier: number | null;
  profit: number | null;
  partialProfit: number;
  queued: boolean;
}

export interface LiveBetFeedItem {
  id: string;
  kind: 'user' | 'bot';
  displayName: string;
  avatarHue: number;
  slot?: BetSlot;
  amount: number;
  type: 'BET' | 'CASH_OUT' | 'BUST' | 'PARTIAL' | 'CANCEL';
  multiplier: number | null;
  profit?: number | null;
  at: number;
}

export interface SimulatedPlayer {
  id: string;
  name: string;
  avatarHue: number;
  active: boolean;
  personality: BotPersonality;
  lastBetAmount: number | null;
  lastCashOutAt: number | null;
}

export interface UserStats {
  totalRoundsPlayed: number;
  totalPracticeBets: number;
  totalPracticeProfit: number;
  bestMultiplier: number;
  averageCashOut: number;
  winRate: number;
}

export interface GlobalStats {
  totalRounds: number;
  averageCrashPoint: number;
  highestCrashPoint: number;
  lowestCrashPoint: number;
  totalPracticeVolume: number;
  activeUsers: number;
  observedRtp: number | null;
  theoreticalRtp: number;
}

export interface ServerMetrics {
  uptimeSeconds: number;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
  activeConnections: number;
  currentRoundId: string | null;
  currentPhase: RoundPhase | null;
  ticksPerSecond: number;
  redisConnected: boolean;
  dbLatencyMs: number;
}

export interface AdminRoundPreview {
  roundNumber: number;
  crashPoint: number;
  serverSeedHash: string;
  note: string;
}

export interface FairnessVerifyRequest {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBps?: number;
}

export interface FairnessVerifyResult {
  serverSeedHash: string;
  crashPoint: number;
  formula: string;
  matchesRound: boolean | null;
  roundId: string | null;
  note: string;
}

export type StrategyType =
  | 'flat'
  | 'fixed_cashout'
  | 'martingale'
  | 'anti_martingale'
  | 'percent_bankroll';

export interface StrategyConfig {
  type: StrategyType;
  baseBet: number;
  cashOutAt: number;
  bankroll: number;
  rounds: number;
  maxBet?: number;
  /** For percent_bankroll: fraction of bankroll per bet (e.g. 0.02 = 2%) */
  bankrollPercent?: number;
  houseEdgeBps?: number;
  seed?: string;
}

export interface StrategyRoundResult {
  round: number;
  crashPoint: number;
  bet: number;
  cashedOut: boolean;
  cashOutAt: number | null;
  profit: number;
  bankroll: number;
}

export interface StrategyRunResult {
  config: StrategyConfig;
  finalBankroll: number;
  netProfit: number;
  maxDrawdown: number;
  winRate: number;
  roundsPlayed: number;
  ruined: boolean;
  equity: number[];
  sampleRounds: StrategyRoundResult[];
  note: string;
}

export interface MonteCarloRequest {
  cashOutAt: number;
  bet: number;
  bankroll: number;
  roundsPerPath: number;
  paths: number;
  houseEdgeBps?: number;
  seed?: string;
}

export interface MonteCarloResult {
  paths: number;
  roundsPerPath: number;
  cashOutAt: number;
  meanFinalBankroll: number;
  medianFinalBankroll: number;
  ruinRate: number;
  avgMaxDrawdown: number;
  theoreticalEvPerRound: number;
  note: string;
}

export interface SessionReport {
  sessionStartedAt: string | null;
  sessionProfit: number;
  sessionLossLimit: number | null;
  sessionTimeLimitMin: number | null;
  bets: number;
  wins: number;
  losses: number;
  bestCashOut: number;
  equity: Array<{ t: string; bankroll: number; profit: number }>;
  myths: Array<{ myth: string; truth: string }>;
}

export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  AUTH: 'auth',
  AUTH_OK: 'auth:ok',
  AUTH_ERROR: 'auth:error',
  ROUND_STATE: 'round:state',
  ROUND_TICK: 'round:tick',
  ROUND_CRASH: 'round:crash',
  ROUND_HISTORY: 'round:history',
  PRACTICE_BET: 'practice:bet',
  PRACTICE_BET_OK: 'practice:bet:ok',
  PRACTICE_BET_ERROR: 'practice:bet:error',
  PRACTICE_CASHOUT: 'practice:cashout',
  PRACTICE_CASHOUT_OK: 'practice:cashout:ok',
  PRACTICE_CASHOUT_ERROR: 'practice:cashout:error',
  PRACTICE_CANCEL: 'practice:cancel',
  PRACTICE_PARTIAL: 'practice:partial',
  LIVE_FEED: 'live:feed',
  SIM_PLAYERS: 'sim:players',
  SIM_PLAYER_ACTION: 'sim:player:action',
  SETTINGS_UPDATE: 'settings:update',
  ERROR: 'error',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/**
 * Multiplier growth curve. Matches classic crash demos:
 * m(t) = e^(growthRate * t_seconds), floored to 2 decimals, min 1.00
 */
export function computeMultiplier(elapsedMs: number, growthRate = 0.06): number {
  const t = Math.max(0, elapsedMs) / 1000;
  const m = Math.exp(growthRate * t);
  return Math.max(1, Math.floor(m * 100) / 100);
}

export function elapsedMsForMultiplier(multiplier: number, growthRate = 0.06): number {
  if (multiplier <= 1) return 0;
  return (Math.log(multiplier) / growthRate) * 1000;
}

/** Theoretical EV of cashing at target given house edge (approximation). */
export function theoreticalEvPerUnit(cashOutAt: number, houseEdgeBps: number): number {
  if (cashOutAt <= 1) return -1;
  const edge = houseEdgeBps / 10_000;
  // Under classic model, P(reach M) ≈ (1-edge)/M
  const pReach = (1 - edge) / cashOutAt;
  return pReach * (cashOutAt - 1) - (1 - pReach) * 1;
}

export const BETTING_MYTHS: Array<{ myth: string; truth: string }> = [
  {
    myth: 'After many low crashes, a high multiplier is due.',
    truth: 'Each round is independent. Past outcomes do not change the next crash probability.',
  },
  {
    myth: 'Martingale guarantees profit eventually.',
    truth: 'A long losing streak or max-bet cap will wipe a bankroll. EV remains negative with house edge.',
  },
  {
    myth: 'You can predict the crash from the animation speed.',
    truth: 'The crash point is fixed before takeoff; the curve only reveals it over time.',
  },
  {
    myth: 'Hot streaks mean the game is loose.',
    truth: 'Variance produces streaks. Over enough rounds, RTP converges toward 1 − house edge.',
  },
  {
    myth: 'Copying big cash-outs is a winning strategy.',
    truth: 'Survivorship bias. You do not see all the busts that used the same target.',
  },
];
