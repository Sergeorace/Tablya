import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import {
  CreateCategorieDto, CreateProduitDto, UpdateCategorieDto, UpdateProduitDto,
} from './dto/catalogue.dto';
import { JwtAuthGuard, PermissionsGuard, Public } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class DisponibiliteDto {
  @Type(() => Boolean) @IsBoolean() disponible!: boolean;
}

/** Back-office : catalogue (module D1). */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  // ---- Catégories ----
  @Get('categories')
  @RequirePermissions('catalogue.gerer')
  listCategories(@CurrentUser() user: AuthUser) {
    return this.catalogue.listCategories(user);
  }

  @Post('categories')
  @RequirePermissions('catalogue.gerer')
  createCategorie(@CurrentUser() user: AuthUser, @Body() dto: CreateCategorieDto) {
    return this.catalogue.createCategorie(user, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions('catalogue.gerer')
  updateCategorie(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCategorieDto) {
    return this.catalogue.updateCategorie(user, id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('catalogue.gerer')
  deleteCategorie(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.catalogue.deleteCategorie(user, id);
  }

  // ---- Produits ----
  @Get('produits')
  @RequirePermissions('catalogue.gerer')
  listProduits(
    @CurrentUser() user: AuthUser,
    @Query('categorieId') categorieId?: string,
    @Query('tous') tous?: string,
  ) {
    return this.catalogue.listProduits(user, categorieId, tous === 'true');
  }

  @Post('produits')
  @RequirePermissions('catalogue.gerer')
  createProduit(@CurrentUser() user: AuthUser, @Body() dto: CreateProduitDto) {
    return this.catalogue.createProduit(user, dto);
  }

  @Patch('produits/:id')
  @RequirePermissions('catalogue.gerer')
  updateProduit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProduitDto) {
    return this.catalogue.updateProduit(user, id, dto);
  }

  @Patch('produits/:id/disponibilite')
  @RequirePermissions('catalogue.gerer')
  setDisponible(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DisponibiliteDto) {
    return this.catalogue.setDisponible(user, id, dto.disponible);
  }

  @Delete('produits/:id')
  @RequirePermissions('catalogue.gerer')
  deleteProduit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.catalogue.deleteProduit(user, id);
  }
}

/** Menu public client (B3) — lu par slug d'établissement. */
@Controller('public')
export class PublicCatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Public()
  @Get('etablissements/:slug/menu')
  getMenu(@Param('slug') slug: string) {
    return this.catalogue.getMenuPublic(slug);
  }
}
