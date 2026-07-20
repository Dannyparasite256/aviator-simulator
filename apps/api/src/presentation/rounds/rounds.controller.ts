import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoundsService } from './rounds.service';

@ApiTags('rounds')
@Controller('rounds')
export class RoundsController {
  constructor(private readonly rounds: RoundsService) {}

  @Get()
  @ApiOperation({ summary: 'List simulation round history' })
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.rounds.list(Number(limit) || 50, Number(offset) || 0);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Round detail' })
  get(@Param('id') id: string) {
    return this.rounds.get(id);
  }

  @Get(':id/replay')
  @ApiOperation({ summary: 'Replay data for a completed simulated round' })
  replay(@Param('id') id: string) {
    return this.rounds.replay(id);
  }
}
