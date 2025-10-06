import { PartialType } from '@nestjs/swagger';
import { CreateInboundRouteDto } from './create-inbound-route.dto';

export class UpdateInboundRouteDto extends PartialType(CreateInboundRouteDto) {}
