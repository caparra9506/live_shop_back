import { Controller, Post, Get, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { TikTokCommentService } from './titokcomments.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

interface AIAnalysisResponse {
  username: string;
  comment: string;
  storeId: number;
  hasPurchaseIntent: boolean;
  detectedProducts: Array<{
    id: number;
    code: string;
    confidence: number;
  }>;
  extractedText?: string;
  reasoningSteps?: string[];
}

@Controller('tiktok-comments')
export class TikTokCommentController {
  constructor(private readonly commentService: TikTokCommentService) {}

   // Obtener comentarios normales (sin intención de compra)
   @UseGuards(JwtAuthGuard)
   @Get('comments')
   getCommentsByStore(
     @Request() req,
     @Query('page') page: string = '1',
     @Query('limit') limit: string = '50',
     @Query('search') search: string = '',
     @Query('searchType') searchType: string = 'all'
   ) {
     const user = req.user;
     return this.commentService.getCommentsTiktokByStore(
       user.id,
       parseInt(page),
       parseInt(limit),
       search,
       searchType
     );
   }


  @UseGuards(JwtAuthGuard)
  @Get('store')
  async startListeningByUserId(@Request() req)  {
    const user = req.user;
    setTimeout(() => {
      this.commentService.startListeningByUserId(user.id);
    }, 0);

    return { message: 'Hilo ejecutado' };
  }

  @Post(':storeId')
  saveComment(@Param('storeId') storeId: number, @Body() body) {
    return this.commentService.saveComment(storeId, body.username, body.comment);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':storeId')
  getComments(@Param('storeId') storeId: number) {
    return this.commentService.getCommentsByStore(storeId);
  }

  @Get('name/:name')
  async startListening(@Param('name') name: string)  {
    setTimeout(() => {
      this.commentService.startListening(name);
    }, 0);

    return { message: 'Hilo ejecutado' };
  }

  @Post('ai-analysis-response')
  async handleAIAnalysisResponse(@Body() analysisResult: AIAnalysisResponse) {
    return this.commentService.processAIAnalysisResponse(analysisResult);
  }

  @UseGuards(JwtAuthGuard)
  @Get('queue/stats')
  async getQueueStats() {
    return this.commentService.getQueueStats();
  }
}
