import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CdrController } from './cdr.controller';
import { CdrService } from './cdr.service';
import { DemoSeedService } from './demo-seed.service';
import { FsXmlController } from './fs-xml.controller';
import { FsService } from './fs.service';
import { FsManagementController } from './fs-management.controller';
import { FsManagementService } from './fs-management.service';
import { RecordingsController } from './recordings.controller';
import { RecordingsService } from './recordings.service';
import { CdrEntity, GatewayEntity, OutboundRuleEntity, RoutingConfigEntity, SettingEntity, TenantEntity, UserEntity } from './entities';
import { FsEventsService } from './fs-events.service';
import { FsRegistrationsGateway } from './fs-registrations.gateway';
import { FsCallsGateway } from './fs-calls.gateway';
import { TenantManagementController } from './tenant-management.controller';
import { TenantManagementService } from './tenant-management.service';
import { GatewayManagementController } from './gateway-management.controller';
import { GatewayManagementService } from './gateway-management.service';
import { OutboundRoutingService } from './outbound-routing.service';
import { OutboundRoutingController } from './outbound-routing.controller';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST', 'mysql'),
        port: parseInt(String(config.get('DB_PORT', 3306)), 10),
        username: config.get('DB_USER', 'fsapp'),
        password: config.get('DB_PASSWORD', 'fsapp'),
        database: config.get('DB_NAME', 'freeswitch'),
        entities: [
          TenantEntity,
          UserEntity,
          RoutingConfigEntity,
          CdrEntity,
          GatewayEntity,
          OutboundRuleEntity,
          SettingEntity,
        ],
        synchronize: String(config.get('DB_SYNC', 'true')).toLowerCase() === 'true',
        logging: String(config.get('DB_LOGGING', 'false')).toLowerCase() === 'true',
        timezone: 'Z',
        extra: {
          connectionLimit: 10,
        },
      }),
    }),
    TypeOrmModule.forFeature([TenantEntity, UserEntity, RoutingConfigEntity, CdrEntity, GatewayEntity, OutboundRuleEntity, SettingEntity]),
  ],
  controllers: [
    FsXmlController,
    CdrController,
    FsManagementController,
    RecordingsController,
    TenantManagementController,
    GatewayManagementController,
    OutboundRoutingController,
    SettingsController,
  ],
  providers: [
    FsService,
    CdrService,
    DemoSeedService,
    FsManagementService,
    RecordingsService,
    FsEventsService,
    FsRegistrationsGateway,
    FsCallsGateway,
    TenantManagementService,
    GatewayManagementService,
    OutboundRoutingService,
    SettingsService,
  ],
})
export class AppModule {}
