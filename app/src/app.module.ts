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
import {
  CdrEntity,
  DialplanActionEntity,
  DialplanRuleEntity,
  GatewayEntity,
  OutboundRuleEntity,
  RoutingConfigEntity,
  SettingEntity,
  TenantEntity,
  UserEntity,
  InboundRouteEntity,
  IvrMenuEntity,
  IvrMenuOptionEntity,
  SystemRecordingEntity,
  PortalUserEntity,
} from './entities';
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
import { DialplanConfigController } from './dialplan-config.controller';
import { DialplanConfigService } from './dialplan-config.service';
import { InboundRoutingService } from './inbound-routing.service';
import { InboundRoutingController } from './inbound-routing.controller';
import { IvrMenuService } from './ivr-menu.service';
import { IvrMenuController } from './ivr-menu.controller';
import { SystemRecordingsService } from './system-recordings.service';
import { SystemRecordingsController } from './system-recordings.controller';
import { PortalUsersController } from './portal-users.controller';
import { PortalUsersService } from './portal-users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { RolesGuard } from './roles.guard';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpLoggingInterceptor } from './interceptors/http-logging.interceptor';

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
          DialplanRuleEntity,
          DialplanActionEntity,
          InboundRouteEntity,
          IvrMenuEntity,
          IvrMenuOptionEntity,
          SystemRecordingEntity,
          PortalUserEntity,
        ],
        synchronize: String(config.get('DB_SYNC', 'true')).toLowerCase() === 'true',
        logging: String(config.get('DB_LOGGING', 'false')).toLowerCase() === 'true',
        timezone: 'Z',
        extra: {
          connectionLimit: 10,
        },
      }),
    }),
    TypeOrmModule.forFeature([
      TenantEntity,
      UserEntity,
      RoutingConfigEntity,
      CdrEntity,
      GatewayEntity,
      OutboundRuleEntity,
      SettingEntity,
      DialplanRuleEntity,
      DialplanActionEntity,
      InboundRouteEntity,
      IvrMenuEntity,
      IvrMenuOptionEntity,
      SystemRecordingEntity,
      PortalUserEntity,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('PORTAL_JWT_SECRET', 'change-me'),
        signOptions: {
          expiresIn: config.get('PORTAL_JWT_EXPIRES', '1h'),
        },
      }),
    }),
  ],
  controllers: [
    FsXmlController,
    CdrController,
    FsManagementController,
    RecordingsController,
    TenantManagementController,
    GatewayManagementController,
    OutboundRoutingController,
    InboundRoutingController,
    IvrMenuController,
    SystemRecordingsController,
    DialplanConfigController,
    SettingsController,
    PortalUsersController,
    AuthController,
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
    InboundRoutingService,
    IvrMenuService,
    SystemRecordingsService,
    SettingsService,
    DialplanConfigService,
    PortalUsersService,
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
})
export class AppModule {}
