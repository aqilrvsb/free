import { ApiProperty } from '@nestjs/swagger';

export class ResetPortalUserPasswordDto {
  @ApiProperty({ description: 'Mật khẩu mới', example: 'NewStrongPass123' })
  password!: string;
}
