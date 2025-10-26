// src/diagrams/dto/create-diagram.dto.ts
import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

export class CreateDiagramDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsObject()
  @IsOptional()
  content?: Record<string, any>;
}
