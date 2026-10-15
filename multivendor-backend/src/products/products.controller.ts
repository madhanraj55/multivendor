import sharp from 'sharp';
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync, unlinkSync } from 'node:fs';
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

/**
 * Detect image MIME type by inspecting leading magic bytes.
 * Validates actual file binary content against standard specifications:
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 * - JPEG: FF D8 FF
 * - WebP: RIFF .... WEBP
 */
export function detectImageSignature(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG signature: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP signature: RIFF [4 bytes size] WEBP
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validates that actual file content on disk matches the declared extension and MIME type.
 * Cleans up (unlinks) partially stored files if validation fails.
 */
export function validateUploadedImageContent(
  filePath: string,
  originalName: string,
  reportedMime: string,
): void {
  const ext = extname(originalName).toLowerCase();
  let buffer: Buffer;

  try {
    const fd = openSync(filePath, 'r');
    buffer = Buffer.alloc(16);
    const bytesRead = readSync(fd, buffer, 0, 16, 0);
    closeSync(fd);

    if (bytesRead < 12) {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
      throw new BadRequestException('Uploaded file is too small or corrupted to be a valid image.');
    }
  } catch (err: unknown) {
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch {}
    }
    if (err instanceof BadRequestException) {
      throw err;
    }
    throw new BadRequestException('Failed to read and validate uploaded image file content.');
  }

  const detectedMime = detectImageSignature(buffer);

  const isMatching =
    (detectedMime === 'image/jpeg' && (ext === '.jpg' || ext === '.jpeg') && reportedMime === 'image/jpeg') ||
    (detectedMime === 'image/png' && ext === '.png' && reportedMime === 'image/png') ||
    (detectedMime === 'image/webp' && ext === '.webp' && reportedMime === 'image/webp');

  if (!detectedMime || !isMatching) {
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch {}
    }
    throw new BadRequestException(
      'Invalid image file content: binary signature does not match declared image type (JPEG, PNG, or WebP).',
    );
  }
}

/**
 * Resolves the public base URL for uploaded assets from configuration.
 * Uses configurable settings (STORAGE_PUBLIC_URL or APP_URL) and prevents
 * untrusted Host header poisoning, while remaining compatible with reverse proxies and HTTPS.
 */
export function getStoragePublicBaseUrl(): string {
  const storagePublicUrl = process.env.STORAGE_PUBLIC_URL?.trim();
  if (storagePublicUrl) {
    return storagePublicUrl.replace(/\/+$/, '');
  }

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    return `${appUrl.replace(/\/+$/, '')}/uploads`;
  }

  const port = process.env.PORT || '3000';
  return `http://localhost:${port}/uploads`;
}

export const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_INPUT_PIXELS = 25_000_000; // 25 megapixels (protect against pixel bombs)
export const MAX_IMAGE_WIDTH = 1600;
export const MAX_IMAGE_HEIGHT = 1600;
export const WEBP_OUTPUT_QUALITY = 82;

export interface OptimizedImageResult {
  filename: string;
  targetPath: string;
  size: number;
  mimeType: 'image/webp';
  width?: number;
  height?: number;
  format: 'webp';
}

/**
 * Validates actual image content using Sharp, auto-rotates based on EXIF orientation,
 * resizes within 1600x1600 (without enlarging smaller images), and converts to WebP (quality 82).
 * Stores only the optimized WebP file in targetDirectory and cleans up temporary uploads.
 * Cleans up partial target files if any error occurs.
 */
export async function optimizeAndStoreProductImage(
  tempFilePath: string,
  targetDirectory: string,
): Promise<OptimizedImageResult> {
  const uniqueId = randomUUID();
  const optimizedFilename = `product-${Date.now()}-${uniqueId}.webp`;
  const targetPath = join(targetDirectory, optimizedFilename);

  try {
    // 1. Inspect image metadata and validate content format using Sharp with pixel bomb protection
    const imagePipeline = sharp(tempFilePath, {
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      failOn: 'error',
    });

    const metadata = await imagePipeline.metadata();

    const allowedFormats = ['jpeg', 'png', 'webp'];
    if (!metadata.format || !allowedFormats.includes(metadata.format)) {
      throw new BadRequestException(
        `Invalid image format "${metadata.format || 'unknown'}". Only JPEG, PNG, and WebP images are allowed.`,
      );
    }

    // 2. Ensure destination directory exists
    mkdirSync(targetDirectory, { recursive: true });

    // 3. Process image: rotate EXIF upright, resize within 1600x1600 without enlargement, convert to WebP quality 82
    const info = await imagePipeline
      .rotate()
      .resize({
        width: MAX_IMAGE_WIDTH,
        height: MAX_IMAGE_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: WEBP_OUTPUT_QUALITY,
        effort: 4,
      })
      .toFile(targetPath);

    return {
      filename: optimizedFilename,
      targetPath,
      size: info.size,
      mimeType: 'image/webp',
      width: info.width,
      height: info.height,
      format: 'webp',
    };
  } catch (err: unknown) {
    // Clean up partial target file if created
    if (existsSync(targetPath)) {
      try {
        unlinkSync(targetPath);
      } catch {}
    }

    if (err instanceof BadRequestException) {
      throw err;
    }

    const message = err instanceof Error ? err.message : 'Unknown image processing error';
    if (message.includes('pixel limit') || message.includes('Input image exceeds pixel limit')) {
      throw new BadRequestException(
        'Image dimensions are excessively large and exceed safety limits.',
      );
    }
    throw new BadRequestException(
      `Failed to process and optimize image: ${message}`,
    );
  } finally {
    // Clean up temporary/original file so only the optimized image remains
    if (existsSync(tempFilePath)) {
      try {
        unlinkSync(tempFilePath);
      } catch {}
    }
  }
}

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
          cb(null, `tmp-${Date.now()}-${uniqueId}${ext}`);
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
        fileSize: MAX_UPLOAD_FILE_SIZE, // 5MB limit
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: UploadedMulterFile,
  ) {
    if (!file || !file.path) {
      throw new BadRequestException('No image file provided for upload');
    }

    // 1. Validate initial binary signature magic bytes
    validateUploadedImageContent(file.path, file.originalname, file.mimetype);

    // 2. Validate, rotate, resize within 1600x1600, convert to WebP quality 82, and save to uploads/products/
    const uploadDir = join(process.cwd(), 'uploads', 'products');
    const optimized = await optimizeAndStoreProductImage(file.path, uploadDir);

    const publicBaseUrl = getStoragePublicBaseUrl();
    const publicUrl = `${publicBaseUrl}/products/${optimized.filename}`;

    return {
      url: publicUrl,
      filename: optimized.filename,
      originalName: file.originalname,
      size: optimized.size,
      mimeType: optimized.mimeType,
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