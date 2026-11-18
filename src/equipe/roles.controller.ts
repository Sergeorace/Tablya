import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { RolesService, CreerRoleDto, MajRoleDto } from './roles.service';
import { JwtAuthGuard, PermissionsGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

class CreerRoleBody implements CreerRoleDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() nom!: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @IsUUID('4', { each: true }) permissionIds!: string[];
}

class MajRoleBody implements MajRoleDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) permissionIds?: string[];
}

/** Rôles & permissions du tenant (composition RBAC, role.gerer). */
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('role.gerer')
  list(@CurrentUser() user: AuthUser) {
    return this.roles.list(user);
  }

  /** Référentiel permissions pour composer un rôle. */
  @Get('permissions')
  @RequirePermissions('role.gerer')
  permissions() {
    return this.roles.permissions();
  }

  @Post()
  @RequirePermissions('role.gerer')
  creer(@CurrentUser() user: AuthUser, @Body() dto: CreerRoleBody) {
    return this.roles.creer(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('role.gerer')
  maj(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MajRoleBody,
  ) {
    return this.roles.maj(user, id, dto);
  }
}
