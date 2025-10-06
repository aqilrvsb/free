import { ApiProperty } from '@nestjs/swagger';

export class LoginRequestDto {
  @ApiProperty({ description: 'Email đăng nhập', example: 'admin@example.com' })
  email!: string;

  @ApiProperty({ description: 'Mật khẩu đăng nhập', example: 'ChangeMe123!' })
  password!: string;
}
