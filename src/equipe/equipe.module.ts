import { Module } from '@nestjs/common';
import { EquipeController } from './equipe.controller';
import { RolesController } from './roles.controller';
import { EmployesService } from './employes.service';
import { PlanningService } from './planning.service';
import { PointageService } from './pointage.service';
import { RolesService } from './roles.service';

@Module({
  controllers: [EquipeController, RolesController],
  providers: [EmployesService, PlanningService, PointageService, RolesService],
})
export class EquipeModule {}
