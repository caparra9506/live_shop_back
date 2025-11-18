import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TikTokDmService } from './tiktok-dm.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

@Controller('tiktok-dm')
export class TikTokDmController {
  constructor(private readonly service: TikTokDmService) {}

  @UseGuards(JwtAuthGuard)
  @Get('store/session/screenshot')
  getQrByToken(@Request() req) {
    return this.service.loginWithQR(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('store/read-dms')
  readDms(@Request() req) {
    return this.service.readDmListOnly(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('store/comments')
  getUserComments(@Request() req) {
    return this.service.getUserComments(req.user.id);
  }
}
