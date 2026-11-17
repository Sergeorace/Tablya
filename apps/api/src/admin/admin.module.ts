import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlatformGuard } from './platform.guard';

@Module({
  controllers: [AdminController],
  providers: [AdminService, PlatformGuard],
})
export class AdminModule {}
