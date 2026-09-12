import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { QuoteService } from './quote.service';

@Controller('v1/quote')
export class QuoteController {
  constructor(private readonly quote: QuoteService) {}

  /**
   * Смета по присланной сцене.
   *
   * Документ приходит целиком, а не идентификатором: смету показывают
   * и до сохранения сцены, пока покупатель ещё двигает шкафы.
   */
  @Post()
  async create(@Req() req: Request, @Body('doc') doc: unknown) {
    return this.quote.quote(req.tenantId!, this.quote.parse(doc));
  }
}
