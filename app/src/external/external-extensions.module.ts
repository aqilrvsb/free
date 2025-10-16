import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantEntity, UserEntity } from '../entities';
import { ExternalExtensionsController } from './extensions.controller';
import { ExternalExtensionsService } from './extensions.service';
import { ExternalApiGuard } from './external-api.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, TenantEntity])],
  controllers: [ExternalExtensionsController],
  providers: [ExternalExtensionsService, ExternalApiGuard],
})
export class ExternalExtensionsModule {}
