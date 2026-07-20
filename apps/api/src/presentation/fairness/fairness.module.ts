import { Module } from '@nestjs/common';
import { FairnessController } from './fairness.controller';
import { FairnessService } from './fairness.service';
import { GameModule } from '../game/game.module';

@Module({
  imports: [GameModule],
  controllers: [FairnessController],
  providers: [FairnessService],
  exports: [FairnessService],
})
export class FairnessModule {}
