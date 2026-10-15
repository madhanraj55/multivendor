import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../auth/decorators/current-user.decorator.js';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../generated/prisma/client.js';
import {
  AdjustStockDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/product.dto.js';
import {
  AddProductImageDto,
  CreateProductVariantDto,
  UpdateProductImageDto,
  UpdateProductVariantDto,
  UpdateVariantStatusDto,
} from './dto/variant-image.dto.js';
import { ProductsService } from './products.service.js';

interface UploadedMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  async findPublished(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.findPublished({
      categoryId,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Public()
  @Get('shop/:shopSlug/:productSlug')
  async findByShopAndSlug(
    @Param('shopSlug') shopSlug: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.productsService.findByShopAndSlug(shopSlug, productSlug);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  @Get('seller/my-products')
  async findSellerProducts(@CurrentUser('userId') userId: string) {
    return this.productsService.findSellerProducts(userId);
  }

  @Public()
  @Get(':id')
  async findPublishedById(@Param('id') id: string) {
    return this.productsService.findPublishedById(id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(userId, dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  @Patch(':id')
  async update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(userId, id, dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  @Post('stock/adjust')
  async adjustStock(
    @CurrentUser('userId') userId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.productsService.adjustStock(userId, dto);
  }

  // ===========================================================================
  // PRODUCT VARIANT MANAGEMENT
  // ===========================================================================

  @Public()
  @Get(':id/variants')
  async getProductVariants(@Param('id') productId: string) {
    return this.productsService.getProductVariants(productId);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @Post(':id/variants')
  @HttpCode(HttpStatus.CREATED)
  async createVariant(
    @Param('id') productId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.productsService.createVariant(productId, user, dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @Patch('variants/:variantId')
  async updateVariant(
    @Param('variantId') variantId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.productsService.updateVariant(variantId, user, dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @Patch('variants/:variantId/status')
  async updateVariantStatus(
    @Param('variantId') variantId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateVariantStatusDto,
  ) {
    return this.productsService.updateVariantStatus(variantId, user, dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @Delete('variants/:variantId')
  @HttpCode(HttpStatus.OK)
  async deleteVariant(
    @Param('variantId') variantId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.productsService.deleteVariant(variantId, user);
  }

  // ===========================================================================
  // PRODUCT IMAGE MANAGEMENT & UPLOAD
  // ===========================================================================

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @Post('upload-image')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, cb: (err: Error | null, dest: string) => void) => {
          const uploadPath = join(process.cwd(), 'uploads', 'products');
          mkdirSync(uploadPath, { recursive: true });
          cb(null, uploadPath);
        },
        filename: (_req: any, file: any, cb: (err: Error | null, name: string) => void) => {
          const ext = extname(file.originalname).toLowerCase();
          const uniqueId = randomUUID();
          cb(null, `${Date.now()}-${uniqueId}${ext}`);
        },
      }),
      fileFilter: (_req: any, file: any, cb: (err: Error | null, accept: boolean) => void) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        const ext = extname(file.originalname).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

        if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
          return cb(
            new BadRequestException(
              'Invalid image format. Only JPEG, PNG, and WebP images are allowed.',
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: UploadedMulterFile,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('No image file provided for upload');
    }

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    const publicUrl = `${protocol}://${host}/uploads/products/${file.filename}`;

    return {
      url: publicUrl,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  @Public()
  @Get(':id/images')
  async getProductImages(@Param('id') productId: string) {
    return this.productsService.getProductImages(productId);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @Post(':id/images')
  @HttpCode(HttpStatus.CREATED)
  async addProductImage(
    @Param('id') productId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AddProductImageDto,
  ) {
    return this.productsService.addProductImage(productId, user, dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @Patch('images/:imageId')
  async updateProductImage(
    @Param('imageId') imageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProductImageDto,
  ) {
    return this.productsService.updateProductImage(imageId, user, dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @Delete('images/:imageId')
  @HttpCode(HttpStatus.OK)
  async deleteProductImage(
    @Param('imageId') imageId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.productsService.deleteProductImage(imageId, user);
  }
}