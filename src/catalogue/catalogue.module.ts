import { Module } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { CatalogueController, PublicCatalogueController } from './catalogue.controller';

@Module({
  controllers: [CatalogueController, PublicCatalogueController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
