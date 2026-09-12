import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { LeadsService } from './leads.service';

interface LeadBody {
  contact: unknown;
  doc: unknown;
  sceneId?: string;
  totalCents?: number;
}

@Controller('v1/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /**
   * Приём заявки.
   *
   * Лимит жёстче общего: форма заявки — самая привлекательная цель для
   * спама, а каждая запись это персональные данные, которые потом надо
   * хранить и удалять по требованию.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async create(@Req() req: Request, @Body() body: LeadBody) {
    return this.leads.create(req.tenantId!, {
      contact: body.contact,
      doc: body.doc,
      sceneId: body.sceneId,
      clientTotalCents: body.totalCents,
    });
  }
}
