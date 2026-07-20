import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CrashPointGenerator } from '../../domain/game/crash-point.generator';
import { FairnessVerifyRequest, FairnessVerifyResult } from '@aviator/shared';
import { GameEngineService } from '../../application/game/game-engine.service';

@Injectable()
export class FairnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: GameEngineService,
  ) {}

  verify(dto: FairnessVerifyRequest): FairnessVerifyResult {
    const edge = dto.houseEdgeBps ?? this.engine.getSettings().houseEdgeBps;
    const result = CrashPointGenerator.verify(
      dto.serverSeed,
      dto.clientSeed,
      dto.nonce,
      edge,
    );
    return {
      serverSeedHash: result.serverSeedHash,
      crashPoint: result.crashPoint,
      formula: result.formula,
      matchesRound: null,
      roundId: null,
      note: 'Educational provably-fair verification. Virtual simulation only.',
    };
  }

  async verifyAgainstRound(roundId: string, houseEdgeBps?: number) {
    const round = await this.prisma.round.findUnique({ where: { id: roundId } });
    if (!round || round.phase !== 'CRASHED') {
      return {
        error: 'Round not found or not yet revealed',
      };
    }
    const edge = houseEdgeBps ?? this.engine.getSettings().houseEdgeBps;
    // After crash, serverSeed field holds the real seed
    const computed = CrashPointGenerator.verify(
      round.serverSeed,
      round.clientSeed,
      round.nonce,
      edge,
    );
    const stored = round.crashPoint != null ? Number(round.crashPoint) : null;
    return {
      roundId: round.id,
      roundNumber: round.roundNumber,
      serverSeed: round.serverSeed,
      serverSeedHash: round.serverSeedHash,
      clientSeed: round.clientSeed,
      nonce: round.nonce,
      storedCrashPoint: stored,
      computedCrashPoint: computed.crashPoint,
      hashMatches: computed.serverSeedHash === round.serverSeedHash,
      crashMatches: stored != null ? Math.abs(stored - computed.crashPoint) < 0.001 : null,
      formula: computed.formula,
      note: 'Commit–reveal check for educational audit',
    };
  }
}
