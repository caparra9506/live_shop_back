import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TikTokUser } from 'src/entity/user-tiktok.entity';
import { TitokUserService } from './tiktok-user.service';

@Controller('tiktokuser')
export class TitokUserController {
    constructor(private readonly titokUserService: TitokUserService) {}

    @Post('register/:store')
    async register(@Param('store') store: string, @Body() userData: Partial<TikTokUser>): Promise<TikTokUser> {
      console.log('store ', store);
      return await this.titokUserService.registerUser(store, userData);
    }
  
    @Get('find/:tiktok')
    async findByTikTok(@Param('tiktok') tiktok: string): Promise<TikTokUser | null> {
      return await this.titokUserService.findByTikTok(tiktok);
    }

    @Get('userId/:userId')
    async findById(@Param('userId') userId: number): Promise<TikTokUser | null> {
      return await this.titokUserService.findById(userId);
    }
}
