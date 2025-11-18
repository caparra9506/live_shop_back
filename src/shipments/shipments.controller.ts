import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  Patch,
  Param,
} from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto } from './dto/shipment.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { TrackingSchedulerService } from '../tracking/tracking-scheduler.service';

@Controller('shipments')
export class ShipmentsController {
  constructor(
    private readonly shipmentsService: ShipmentsService,
    private readonly trackingSchedulerService: TrackingSchedulerService,
  ) {}

  @Post('shipment-quote')
  async create(@Body() createShipmentDto: CreateShipmentDto) {
    const { userTikTokId, productId, storeName } = createShipmentDto;
    return this.shipmentsService.createShipment(
      userTikTokId,
      productId,
      storeName,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('/status')
  async getShippingStatus(@Request() req) {
    return this.shipmentsService.getShippingStatus(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('status/:guideNumber')
  async updateStatusByGuide(
    @Param('guideNumber') guideNumber: string,
    @Body('status') status: string,
  ) {
    return this.shipmentsService.updateShippingStatusByGuide(
      guideNumber,
      status,
    );
  }

  @Post('tracking-webhook')
  async receiveTrackingUpdate(@Body() trackingData: any) {
    return this.shipmentsService.processTrackingUpdate(trackingData);
  }

  @Get('tracking/:guideNumber')
  async getTrackingInfo(@Param('guideNumber') guideNumber: string) {
    return this.shipmentsService.getTrackingInfo(guideNumber);
  }
}
