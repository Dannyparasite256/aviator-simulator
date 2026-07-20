import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FairnessService } from './fairness.service';

class VerifyDto {
  @ApiProperty() @IsString() serverSeed!: string;
  @ApiProperty() @IsString() clientSeed!: string;
  @ApiProperty() @IsInt() @Min(0) nonce!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() houseEdgeBps?: number;
}

@ApiTags('fairness')
@Controller('fairness')
export class FairnessController {
  constructor(private readonly fairness: FairnessService) {}

  @Post('verify')
  @ApiOperation({ summary: 'Recompute crash point from seeds (provably fair demo)' })
  verify(@Body() dto: VerifyDto) {
    return this.fairness.verify(dto);
  }

  @Get('rounds/:id/verify')
  @ApiOperation({ summary: 'Verify a completed round against stored seeds' })
  verifyRound(@Param('id') id: string, @Query('houseEdgeBps') edge?: string) {
    return this.fairness.verifyAgainstRound(id, edge ? Number(edge) : undefined);
  }
}
