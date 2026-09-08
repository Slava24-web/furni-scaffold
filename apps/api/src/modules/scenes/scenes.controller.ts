import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ScenesService } from './scenes.service';

@Controller('v1/scenes')
export class ScenesController {
  constructor(private readonly scenes: ScenesService) {}

  @Post()
  create(@Req() req: Request, @Body('session') session: string) {
    return this.scenes.create(req.tenantId!, session);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.scenes.get(req.tenantId!, id);
  }

  @Put(':id')
  save(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.scenes.save(req.tenantId!, id, body);
  }
}
