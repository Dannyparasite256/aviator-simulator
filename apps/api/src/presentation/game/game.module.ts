import { Module } from '@nestjs/common';
import { GameEngineService } from '../../application/game/game-engine.service';
import { SimulatedPlayersService } from '../../application/game/simulated-players.service';
import { GameGateway } from './game.gateway';
import { PracticeService } from './practice.service';
import { PracticeController } from './practice.controller';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [PracticeController],
  providers: [
    GameEngineService,
    SimulatedPlayersService,
    GameGateway,
    PracticeService,
  ],
  exports: [GameEngineService, SimulatedPlayersService, PracticeService],
})
export class GameModule {}
