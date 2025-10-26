// src/diagrams/diagrams.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiagramsService } from './diagrams.service';
import { DiagramsController } from './diagrams.controller';
import { Diagram } from './entities/diagram.entity';
import { User } from 'src/users/entities/user.entity';
import { AuthModule } from 'src/auth/auth.module';
import { CodeGenerationService } from './code-generation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Diagram, User]), AuthModule],
  controllers: [DiagramsController],
  providers: [DiagramsService,CodeGenerationService,],
  exports: [DiagramsService,CodeGenerationService],
})
export class DiagramsModule {}
