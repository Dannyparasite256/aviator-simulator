import { Module } from '@nestjs/common';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';
import { GameModule } from '../game/game.module';

@Module({
  imports: [GameModule],
  controllers: [LabController],
  providers: [LabService],
})
export class LabModule {}
