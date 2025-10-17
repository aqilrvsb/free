import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentEntity, TenantEntity, UserEntity } from '../entities';
import { ExternalExtensionsController } from './extensions.controller';
import { ExternalExtensionsService } from './extensions.service';
import { ExternalApiGuard } from './external-api.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, TenantEntity, AgentEntity])],
  controllers: [ExternalExtensionsController],
  providers: [ExternalExtensionsService, ExternalApiGuard],
})
export class ExternalExtensionsModule {}
