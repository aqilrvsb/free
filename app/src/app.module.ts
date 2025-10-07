import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CdrController } from './telephony/cdr.controller';
import { CdrService } from './telephony/cdr.service';
import { DemoSeedService } from './demo-seed.service';
import { FsXmlController } from './freeswitch/fs-xml.controller';
import { FsService } from './freeswitch/fs.service';
import { FsManagementController } from './freeswitch/fs-management.controller';
import { FsManagementService } from './freeswitch/fs-management.service';
import { RecordingsController } from './telephony/recordings.controller';
import { RecordingsService } from './telephony/recordings.service';
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
  PortalRoleEntity,
  PortalUserTenantEntity,
} from './entities';
import { FsEventsService } from './freeswitch/fs-events.service';
import { FsRegistrationsGateway } from './freeswitch/fs-registrations.gateway';
import { FsCallsGateway } from './freeswitch/fs-calls.gateway';
import { TenantManagementController } from './tenant/tenant-management.controller';
import { TenantManagementService } from './tenant/tenant-management.service';
import { GatewayManagementController } from './telephony/gateway-management.controller';
import { GatewayManagementService } from './telephony/gateway-management.service';
import { OutboundRoutingService } from './routing/outbound-routing.service';
import { OutboundRoutingController } from './routing/outbound-routing.controller';
import { SettingsService } from './telephony/settings.service';
import { SettingsController } from './telephony/settings.controller';
import { DialplanConfigController } from './routing/dialplan-config.controller';
import { DialplanConfigService } from './routing/dialplan-config.service';
import { InboundRoutingService } from './routing/inbound-routing.service';
import { InboundRoutingController } from './routing/inbound-routing.controller';
import { IvrMenuService } from './ivr/ivr-menu.service';
import { IvrMenuController } from './ivr/ivr-menu.controller';
import { SystemRecordingsService } from './telephony/system-recordings.service';
import { SystemRecordingsController } from './telephony/system-recordings.controller';
import { PortalUsersController } from './portal/portal-users.controller';
import { PortalUsersService } from './portal/portal-users.service';
import { PortalRolesController } from './portal/portal-roles.controller';
import { PortalRolesService } from './portal/portal-roles.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtStrategy } from './auth/jwt.strategy';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { RolesGuard } from './auth/roles.guard';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpLoggingInterceptor } from './interceptors/http-logging.interceptor';
import { SecurityController } from './security/security.controller';
import { SecurityService } from './security/security.service';

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
          PortalRoleEntity,
          PortalUserTenantEntity,
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
      PortalRoleEntity,
      PortalUserTenantEntity,
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
    HttpModule.register({
      timeout: 3000,
      maxRedirects: 3,
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
    PortalRolesController,
    AuthController,
    SecurityController,
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
    PortalRolesService,
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    SecurityService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
})
export class AppModule {}
