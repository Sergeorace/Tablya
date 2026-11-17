import { Module } from '@nestjs/common';
import { SalleService } from './salle.service';
import { SalleController, PublicSalleController } from './salle.controller';

@Module({
  controllers: [SalleController, PublicSalleController],
  providers: [SalleService],
  exports: [SalleService],
})
export class SalleModule {}
