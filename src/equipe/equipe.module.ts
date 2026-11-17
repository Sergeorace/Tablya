import { Module } from '@nestjs/common';
import { EquipeController } from './equipe.controller';
import { EmployesService } from './employes.service';
import { PlanningService } from './planning.service';
import { PointageService } from './pointage.service';

@Module({
  controllers: [EquipeController],
  providers: [EmployesService, PlanningService, PointageService],
})
export class EquipeModule {}
