import { PartialType } from '@nestjs/swagger';
import { CreateOutboundRouteDto } from './create-outbound-route.dto';

export class UpdateOutboundRouteDto extends PartialType(CreateOutboundRouteDto) {}
