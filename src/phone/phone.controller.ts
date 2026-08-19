import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { PhoneService } from './phone.service';
import { PhoneCompleteDto, RequestPhoneDto } from './dto/phone.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Phone')
@Controller('phone')
export class PhoneController {
  constructor(private readonly phone: PhoneService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request phone verification', description: 'Send a verification code to the phone number.' })
  @ApiBody({ type: RequestPhoneDto })
  @ApiResponse({ status: 200, description: 'Verification code sent.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  request(@CurrentUser('sub') userId: string, @Body() dto: RequestPhoneDto) {
    return this.phone.requestVerification(userId, dto.phone);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete phone verification', description: 'Verify the phone code and mark as verified.' })
  @ApiBody({ type: PhoneCompleteDto })
  @ApiResponse({ status: 200, description: 'Phone verified.' })
  @ApiResponse({ status: 400, description: 'Invalid code.' })
  async complete(
    @CurrentUser('sub') _userId: string,
    @Body() dto: PhoneCompleteDto,
  ) {
    const user = await this.phone.completeCode(dto.phone, dto.code);
    return {
      success: true,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt,
    };
  }

  @Post('remove')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove phone number', description: 'Remove and unverify the phone number.' })
  @ApiResponse({ status: 200, description: 'Phone removed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(@CurrentUser('sub') userId: string) {
    return this.phone.remove(userId);
  }
}
