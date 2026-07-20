import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { GameModule } from '../game/game.module';
import { RoundsModule } from '../rounds/rounds.module';

@Module({
  imports: [GameModule, RoundsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
