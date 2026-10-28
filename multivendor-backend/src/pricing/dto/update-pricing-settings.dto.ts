import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DeliveryTierRuleDto {
  @IsNumber()
  @Min(0)
  maxKm!: number;

  @IsNumber()
  @Min(0)
  fee!: number;
}

export class DeliveryRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryTierRuleDto)
  @IsOptional()
  tiers?: DeliveryTierRuleDto[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  fallbackLocalFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  fallbackRegionalFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  fallbackNationalFee?: number;
}

export class UpdatePricingSettingsDto {
  @IsNumber({}, { message: 'Commission percentage must be a number' })
  @Min(0, { message: 'Commission percentage cannot be negative' })
  @Max(100, { message: 'Commission percentage cannot exceed 100%' })
  @IsOptional()
  globalCommissionPercentage?: number;

  @IsNumber({}, { message: 'Platform fee must be a number' })
  @Min(0, { message: 'Platform fee cannot be negative' })
  @IsOptional()
  platformFee?: number;

  @ValidateNested()
  @Type(() => DeliveryRulesDto)
  @IsOptional()
  deliveryRules?: DeliveryRulesDto;
}
