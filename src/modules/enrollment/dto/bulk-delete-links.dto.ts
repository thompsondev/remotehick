import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class BulkDeleteEnrollmentLinksDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}
