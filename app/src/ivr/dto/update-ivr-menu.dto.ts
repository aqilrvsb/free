import { PartialType } from '@nestjs/swagger';
import { CreateIvrMenuDto } from './create-ivr-menu.dto';

export class UpdateIvrMenuDto extends PartialType(CreateIvrMenuDto) {}
