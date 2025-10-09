import { IsOptional, IsString } from 'class-validator';

export class LogoutRequestDto {
  @IsOptional()
  @IsString()
  refreshToken?: string | null;
}
