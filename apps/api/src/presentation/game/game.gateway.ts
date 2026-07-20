import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { BetSlot, SOCKET_EVENTS } from '@aviator/shared';
import { GameEngineService } from '../../application/game/game-engine.service';
import { SimulatedPlayersService } from '../../application/game/simulated-players.service';
import { PracticeService } from './practice.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);
  private readonly sockets = new Set<string>();

  constructor(
    private readonly engine: GameEngineService,
    private readonly simPlayers: SimulatedPlayersService,
    private readonly practice: PracticeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.engine.on(SOCKET_EVENTS.ROUND_TICK, (p) => {
      this.server?.emit(SOCKET_EVENTS.ROUND_TICK, p);
    });
    this.engine.on(SOCKET_EVENTS.ROUND_STATE, (p) => {
      this.server?.emit(SOCKET_EVENTS.ROUND_STATE, p);
    });
    this.engine.on(SOCKET_EVENTS.ROUND_CRASH, (p) => {
      this.server?.emit(SOCKET_EVENTS.ROUND_CRASH, p);
    });
    this.engine.on(SOCKET_EVENTS.SIM_PLAYER_ACTION, (p) => {
      this.server?.emit(SOCKET_EVENTS.SIM_PLAYER_ACTION, p);
    });
    this.engine.on(SOCKET_EVENTS.SETTINGS_UPDATE, (p) => {
      this.server?.emit(SOCKET_EVENTS.SETTINGS_UPDATE, p);
    });
    this.engine.on(SOCKET_EVENTS.LIVE_FEED, (p) => {
      this.server?.emit(SOCKET_EVENTS.LIVE_FEED, p);
    });
  }

  async handleConnection(client: Socket) {
    this.sockets.add(client.id);
    this.engine.setConnectionCount(this.sockets.size);

    const token =
      (client.handshake.auth?.token as string | undefined) ||
      (client.handshake.headers.authorization?.replace('Bearer ', '') as string | undefined);

    if (token) {
      try {
        const payload = this.jwt.verify<{ sub: string; type: string }>(token, {
          secret: this.config.get<string>('JWT_SECRET', 'dev-secret'),
        });
        if (payload.type === 'access') {
          client.data.userId = payload.sub;
          client.emit(SOCKET_EVENTS.AUTH_OK, { userId: payload.sub });
        }
      } catch {
        client.emit(SOCKET_EVENTS.AUTH_ERROR, { message: 'Invalid token' });
      }
    }

    client.emit(SOCKET_EVENTS.ROUND_STATE, this.engine.publicState());
    client.emit(SOCKET_EVENTS.SIM_PLAYERS, this.simPlayers.getActive());

    const history = await this.prisma.round.findMany({
      where: { phase: 'CRASHED' },
      orderBy: { roundNumber: 'desc' },
      take: 40,
      select: {
        id: true,
        roundNumber: true,
        crashPoint: true,
        serverSeedHash: true,
        createdAt: true,
      },
    });
    client.emit(
      SOCKET_EVENTS.ROUND_HISTORY,
      history.map((r) => ({
        ...r,
        crashPoint: r.crashPoint != null ? Number(r.crashPoint) : null,
        createdAt: r.createdAt.toISOString(),
      })),
    );

    this.logger.debug(`Client connected ${client.id} (total ${this.sockets.size})`);
  }

  handleDisconnect(client: Socket) {
    this.sockets.delete(client.id);
    this.engine.setConnectionCount(this.sockets.size);
  }

  @SubscribeMessage(SOCKET_EVENTS.PRACTICE_BET)
  async onPracticeBet(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { amount: number; slot?: BetSlot; autoCashOutAt?: number; queueIfClosed?: boolean },
  ) {
    if (!client.data.userId) {
      client.emit(SOCKET_EVENTS.PRACTICE_BET_ERROR, { message: 'Authentication required' });
      return;
    }
    try {
      const result = await this.practice.placeBet(client.data.userId, {
        amount: body.amount,
        slot: (body.slot === 2 ? 2 : 1) as BetSlot,
        autoCashOutAt: body.autoCashOutAt,
        queueIfClosed: body.queueIfClosed,
      });
      client.emit(SOCKET_EVENTS.PRACTICE_BET_OK, result);
    } catch (err) {
      client.emit(SOCKET_EVENTS.PRACTICE_BET_ERROR, {
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.PRACTICE_CASHOUT)
  async onPracticeCashout(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { slot?: BetSlot; fraction?: number },
  ) {
    if (!client.data.userId) {
      client.emit(SOCKET_EVENTS.PRACTICE_CASHOUT_ERROR, {
        message: 'Authentication required',
      });
      return;
    }
    try {
      const result = await this.practice.cashOut(
        client.data.userId,
        (body?.slot === 2 ? 2 : 1) as BetSlot,
        body?.fraction ?? 1,
      );
      client.emit(SOCKET_EVENTS.PRACTICE_CASHOUT_OK, result);
    } catch (err) {
      client.emit(SOCKET_EVENTS.PRACTICE_CASHOUT_ERROR, {
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.PRACTICE_CANCEL)
  async onCancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { slot?: BetSlot },
  ) {
    if (!client.data.userId) {
      client.emit(SOCKET_EVENTS.PRACTICE_BET_ERROR, { message: 'Authentication required' });
      return;
    }
    try {
      const result = await this.practice.cancelBet(
        client.data.userId,
        (body?.slot === 2 ? 2 : 1) as BetSlot,
      );
      client.emit(SOCKET_EVENTS.PRACTICE_BET_OK, result);
    } catch (err) {
      client.emit(SOCKET_EVENTS.PRACTICE_BET_ERROR, {
        message: (err as Error).message,
      });
    }
  }

  /** Client requests full live snapshot after reconnect */
  @SubscribeMessage('resync')
  async onResync(@ConnectedSocket() client: Socket) {
    client.emit(SOCKET_EVENTS.ROUND_STATE, this.engine.publicState());
    client.emit(SOCKET_EVENTS.SIM_PLAYERS, this.simPlayers.getActive());
    const history = await this.prisma.round.findMany({
      where: { phase: 'CRASHED' },
      orderBy: { roundNumber: 'desc' },
      take: 40,
      select: {
        id: true,
        roundNumber: true,
        crashPoint: true,
        serverSeedHash: true,
        createdAt: true,
      },
    });
    client.emit(
      SOCKET_EVENTS.ROUND_HISTORY,
      history.map((r) => ({
        ...r,
        crashPoint: r.crashPoint != null ? Number(r.crashPoint) : null,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  }
}
