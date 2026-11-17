import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientAuthService } from './client-auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [ClientsController],
  providers: [ClientsService, ClientAuthService],
  exports: [ClientsService],
})
export class ClientsModule {}
