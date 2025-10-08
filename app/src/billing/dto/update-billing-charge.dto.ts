import { PartialType } from '@nestjs/swagger';
import { CreateBillingChargeDto } from './create-billing-charge.dto';

export class UpdateBillingChargeDto extends PartialType(CreateBillingChargeDto) {}
