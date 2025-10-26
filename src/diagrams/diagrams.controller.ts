// src/diagrams/diagrams.controller.ts
import { Controller, Get, Post, Body, Param, Delete, Put, UseGuards, Patch, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { DiagramsService } from './diagrams.service';
import { CreateDiagramDto } from './dto/create-diagram.dto';
import { UpdateDiagramDto } from './dto/update-diagram.dto';
import { Auth } from 'src/auth/decorator/auth.decorators';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorator/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';

@ApiBearerAuth()
@Controller('diagrams')
@Auth(Role.USER)
export class DiagramsController {
  constructor(private readonly diagramsService: DiagramsService) { }

  @Post()
  create(
    @Body() createDiagramDto: CreateDiagramDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.diagramsService.create(createDiagramDto, { id: user.sub } as any);
  }

  @Get()
  findAll(@ActiveUser() user: ActiveUserInterface) {
    return this.diagramsService.findAllByUser(user.sub);
  }

  @Get('shared')
  findShared(@ActiveUser() user: ActiveUserInterface) {
    return this.diagramsService.findShared(user.sub);
  }


  @Get(':id')
  findOne(@Param('id') id: number, @ActiveUser() user: ActiveUserInterface) {
    return this.diagramsService.findOne(id, { id: user.sub } as any);
  }

  @Patch(':id')
  @ApiBody({ type: CreateDiagramDto })
  update(
    @Param('id') id: number,
    @Body() updateDiagramDto: UpdateDiagramDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.diagramsService.update(id, updateDiagramDto, { id: user.sub } as any);
  }

  @Delete(':id')
  remove(@Param('id') id: number, @ActiveUser() user: ActiveUserInterface) {
    return this.diagramsService.remove(id, { id: user.sub } as any);
  }

  @Post(':id/share/:userId')
  shareDiagram(
    @Param('id') id: number,
    @Param('userId') userId: number,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.diagramsService.shareDiagram(id, userId, { id: user.sub } as any);
  }

  @Post(':id/generate-from-prompt')
  async generateFromPrompt(
    @Param('id') id: number,
    @Body() body: { prompt: string },
    @ActiveUser() user: ActiveUserInterface,
  ) {
    console.log('Generating diagram from prompt Controller:', body.prompt);
    return this.diagramsService.generateDiagramFromPrompt(
      id, 
      body.prompt, 
      { id: user.sub } as any
    );
  }

  @Post(':id/generate-code')
  @ApiQuery({ name: 'projectName', required: false })
  @ApiQuery({ name: 'basePackage', required: false })
  async generateSpringBootCode(
    @Param('id') id: number,
    @Query('projectName') projectName: string,
    @Query('basePackage') basePackage: string,
    @ActiveUser() user: ActiveUserInterface,
    @Res() res: Response,
  ) {
    const zipBuffer = await this.diagramsService.generateSpringBootCode(
      id,
      { id: user.sub } as any,
      projectName,
      basePackage
    );

    const filename = projectName || `diagram-${id}-springboot`;
    
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}.zip"`,
      'Content-Length': zipBuffer.length,
    });

    res.send(zipBuffer);
  }

}
