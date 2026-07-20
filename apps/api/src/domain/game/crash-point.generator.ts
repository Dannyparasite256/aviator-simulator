import { createHash, createHmac, randomBytes } from 'crypto';

/**
 * Provably-fair crash point generator (educational clone of classic crash math).
 *
 * Commit–reveal:
 *  1. Server publishes SHA256(serverSeed) before the round.
 *  2. After crash, serverSeed is revealed so anyone can recompute.
 *
 * Formula (single house-edge application):
 *  h = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)
 *  r = first 52 bits of h as integer
 *  If r % (1/edge bucket) → instant 1.00x path approximating edge mass at 1.00
 *  Else crash = floor((100 * 2^52 / (r+1))) / 100
 *  Then apply edge: crash = max(1.00, floor(crash * (1-edge) * 100) / 100)
 *
 * Actually the canonical Bustabit-style formula embeds edge as:
 *  crash = max(1, floor( (100 * 2^52 - r) / (2^52 - r) ) / 100 ) with edge via
 *  the instant-bust probability OR multiply by (1-edge).
 *
 * We use the widely documented approach:
 *  result = (100 * 2^52 / (r + 1)) / 100   floored
 *  with house edge: final = max(1.00, floor(result * (1 - edge) * 100) / 100)
 * and NO additional modulo instant-bust (avoids double-counting edge).
 */
export class CrashPointGenerator {
  static generateServerSeed(): string {
    return randomBytes(32).toString('hex');
  }

  static generateClientSeed(): string {
    return randomBytes(16).toString('hex');
  }

  static hashSeed(serverSeed: string): string {
    return createHash('sha256').update(serverSeed).digest('hex');
  }

  static hmac(serverSeed: string, clientSeed: string, nonce: number): string {
    return createHmac('sha256', serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest('hex');
  }

  /**
   * Derive a per-round server seed from the master chain.
   * Enables accurate admin preview of upcoming crash points.
   */
  static deriveRoundServerSeed(masterSeed: string, nonce: number): string {
    return createHmac('sha256', masterSeed)
      .update(`round-server-seed:${nonce}`)
      .digest('hex');
  }

  /**
   * @param houseEdgeBps basis points (e.g. 300 = 3%) — applied once
   */
  static computeCrashPoint(
    serverSeed: string,
    clientSeed: string,
    nonce: number,
    houseEdgeBps: number,
    minMultiplier = 1.0,
    maxMultiplier = 1_000_000,
  ): number {
    const hex = this.hmac(serverSeed, clientSeed, nonce);
    // 52-bit integer from first 13 hex chars
    const r = parseInt(hex.slice(0, 13), 16);
    const e = Math.pow(2, 52);
    const edge = Math.min(0.2, Math.max(0, houseEdgeBps / 10_000));

    // Classic inverse distribution (unbiased raw multiplier)
    // Avoid div-by-zero when r is max
    const denom = e - (r % e);
    const raw = Math.floor((100 * e - r) / denom) / 100;

    // Single house-edge application
    const withEdge = Math.max(1, raw * (1 - edge));
    const rounded = Math.floor(withEdge * 100) / 100;
    return this.clamp(rounded, minMultiplier, maxMultiplier);
  }

  static verify(
    serverSeed: string,
    clientSeed: string,
    nonce: number,
    houseEdgeBps: number,
    minMultiplier = 1.0,
    maxMultiplier = 1_000_000,
  ) {
    return {
      serverSeedHash: this.hashSeed(serverSeed),
      hmac: this.hmac(serverSeed, clientSeed, nonce),
      crashPoint: this.computeCrashPoint(
        serverSeed,
        clientSeed,
        nonce,
        houseEdgeBps,
        minMultiplier,
        maxMultiplier,
      ),
      formula:
        'crash = floor(max(1, raw * (1 - edge)) * 100) / 100 where raw = floor((100*2^52 - r)/(2^52 - r%2^52))/100, r = int(HMAC_SHA256(serverSeed, clientSeed:nonce)[0:13], 16)',
    };
  }

  private static clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
  }

  /**
   * Preview crash points for a chain of nonces using master-seed derivation.
   */
  static previewUpcoming(
    masterSeed: string,
    clientSeed: string,
    startNonce: number,
    count: number,
    houseEdgeBps: number,
    minMultiplier: number,
    maxMultiplier: number,
  ): Array<{
    nonce: number;
    crashPoint: number;
    serverSeed: string;
    serverSeedHash: string;
  }> {
    const out: Array<{
      nonce: number;
      crashPoint: number;
      serverSeed: string;
      serverSeedHash: string;
    }> = [];
    for (let i = 0; i < count; i++) {
      const nonce = startNonce + i;
      const serverSeed = this.deriveRoundServerSeed(masterSeed, nonce);
      out.push({
        nonce,
        serverSeed,
        serverSeedHash: this.hashSeed(serverSeed),
        crashPoint: this.computeCrashPoint(
          serverSeed,
          clientSeed,
          nonce,
          houseEdgeBps,
          minMultiplier,
          maxMultiplier,
        ),
      });
    }
    return out;
  }
}
