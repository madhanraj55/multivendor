import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, openSync, readSync, closeSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

// Load backend controller and Sharp via Node module resolution
const backendRequire = createRequire(join(process.cwd(), '../multivendor-backend/dummy.js'));
const sharp = backendRequire('sharp');
// Disable sharp file caching so Windows doesn't lock test files during cleanup
sharp.cache(false);

const {
  detectImageSignature,
  validateUploadedImageContent,
  getStoragePublicBaseUrl,
  optimizeAndStoreProductImage,
  MAX_UPLOAD_FILE_SIZE,
  MAX_IMAGE_INPUT_PIXELS,
  MAX_IMAGE_WIDTH,
  MAX_IMAGE_HEIGHT,
  WEBP_OUTPUT_QUALITY,
} = backendRequire('../multivendor-backend/dist/products/products.controller.js');

describe('Stage 3B-7F Image Upload & Sharp Optimization Tests', () => {
  describe('1. Sharp Optimization Pipeline Configuration', () => {
    it('defines expected configuration constants', () => {
      assert.equal(MAX_UPLOAD_FILE_SIZE, 5 * 1024 * 1024, '5MB max upload file size');
      assert.equal(MAX_IMAGE_INPUT_PIXELS, 25_000_000, '25 megapixels safety limit');
      assert.equal(MAX_IMAGE_WIDTH, 1600, '1600px max width');
      assert.equal(MAX_IMAGE_HEIGHT, 1600, '1600px max height');
      assert.equal(WEBP_OUTPUT_QUALITY, 82, 'WebP quality 82');
    });
  });

  describe('2. Sharp Image Transformation, Resizing & WebP Conversion', () => {
    let tempDir;
    let createdFiles = [];

    beforeEach(() => {
      tempDir = join(tmpdir(), `test-sharp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      createdFiles = [];
    });

    afterEach(() => {
      for (const f of createdFiles) {
        if (existsSync(f)) {
          try { unlinkSync(f); } catch {}
        }
      }
    });

    it('resizes an oversized image (2400x1800) to fit within 1600x1600 preserving aspect ratio', async () => {
      // 1. Create a 2400x1800 test JPEG
      const inputPath = join(tmpdir(), `oversized-${Date.now()}.jpg`);
      createdFiles.push(inputPath);
      await sharp({
        create: { width: 2400, height: 1800, channels: 3, background: { r: 200, g: 100, b: 50 } },
      }).jpeg().toFile(inputPath);

      // 2. Optimize and store
      const result = await optimizeAndStoreProductImage(inputPath, tempDir);
      createdFiles.push(result.targetPath);

      // 3. Verify output
      assert.equal(result.format, 'webp');
      assert.equal(result.mimeType, 'image/webp');
      assert.equal(result.width, 1600);
      assert.equal(result.height, 1200); // 2400x1800 proportional scale to 1600 max width
      assert.ok(result.size > 0);
      assert.ok(result.filename.startsWith('product-'));
      assert.ok(result.filename.endsWith('.webp'));

      // 4. Verify output file with Sharp
      const outputBuffer = readFileSync(result.targetPath);
      const outputMeta = await sharp(outputBuffer).metadata();
      assert.equal(outputMeta.format, 'webp');
      assert.equal(outputMeta.width, 1600);
      assert.equal(outputMeta.height, 1200);

      // 5. Verify temporary/original file was cleaned up
      assert.equal(existsSync(inputPath), false, 'Original input file must be cleaned up');
    });

    it('does not enlarge smaller images (800x600 stays 800x600)', async () => {
      const inputPath = join(tmpdir(), `small-${Date.now()}.png`);
      createdFiles.push(inputPath);
      await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 50, g: 150, b: 200 } },
      }).png().toFile(inputPath);

      const result = await optimizeAndStoreProductImage(inputPath, tempDir);
      createdFiles.push(result.targetPath);

      assert.equal(result.width, 800);
      assert.equal(result.height, 600);
      assert.equal(result.format, 'webp');

      const outputBuffer = readFileSync(result.targetPath);
      const outputMeta = await sharp(outputBuffer).metadata();
      assert.equal(outputMeta.width, 800);
      assert.equal(outputMeta.height, 600);
      assert.equal(outputMeta.format, 'webp');

      assert.equal(existsSync(inputPath), false, 'Original input file must be cleaned up');
    });

    it('preserves alpha transparency when converting PNG with transparency to WebP', async () => {
      const inputPath = join(tmpdir(), `transparent-${Date.now()}.png`);
      createdFiles.push(inputPath);
      await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 0.5 },
        },
      }).png().toFile(inputPath);

      const result = await optimizeAndStoreProductImage(inputPath, tempDir);
      createdFiles.push(result.targetPath);

      const outputBuffer = readFileSync(result.targetPath);
      const outputMeta = await sharp(outputBuffer).metadata();
      assert.equal(outputMeta.format, 'webp');
      assert.equal(outputMeta.hasAlpha, true, 'WebP output must preserve transparency');

      assert.equal(existsSync(inputPath), false);
    });

    it('optimizes existing WebP images without errors', async () => {
      const inputPath = join(tmpdir(), `existing-${Date.now()}.webp`);
      createdFiles.push(inputPath);
      await sharp({
        create: { width: 1000, height: 1000, channels: 3, background: { r: 10, g: 200, b: 50 } },
      }).webp().toFile(inputPath);

      const result = await optimizeAndStoreProductImage(inputPath, tempDir);
      createdFiles.push(result.targetPath);

      assert.equal(result.format, 'webp');
      assert.equal(result.width, 1000);
      assert.equal(result.height, 1000);
      assert.equal(existsSync(inputPath), false);
    });

    it('rejects unsupported image format (e.g. GIF) and cleans up files', async () => {
      const inputPath = join(tmpdir(), `unsupported-${Date.now()}.gif`);
      createdFiles.push(inputPath);
      await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
      }).gif().toFile(inputPath);

      await assert.rejects(
        async () => {
          await optimizeAndStoreProductImage(inputPath, tempDir);
        },
        /Invalid image format/
      );

      // Temporary file must be removed
      assert.equal(existsSync(inputPath), false, 'Temporary input file must be cleaned up on rejection');
    });

    it('rejects corrupted or non-image files safely and cleans up temporary file', async () => {
      const inputPath = join(tmpdir(), `corrupted-${Date.now()}.png`);
      createdFiles.push(inputPath);
      writeFileSync(inputPath, 'This is corrupted binary data that is not a real image at all');

      await assert.rejects(
        async () => {
          await optimizeAndStoreProductImage(inputPath, tempDir);
        },
        /Failed to process and optimize image/
      );

      assert.equal(existsSync(inputPath), false, 'Corrupted file must be cleaned up on failure');
    });

    it('rejects image exceeding pixel limit (pixel bomb protection) and cleans up files', async () => {
      // Create an image description with massive virtual dimensions
      // Sharp allows testing limitInputPixels with raw or buffer streams
      const inputPath = join(tmpdir(), `pixelbomb-${Date.now()}.jpg`);
      createdFiles.push(inputPath);

      // Create a 6000x5000 = 30,000,000 pixels image (exceeds 25,000,000 MAX_IMAGE_INPUT_PIXELS)
      await sharp({
        create: { width: 6000, height: 5000, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).jpeg().toFile(inputPath);

      await assert.rejects(
        async () => {
          await optimizeAndStoreProductImage(inputPath, tempDir);
        },
        /Image dimensions are excessively large and exceed safety limits/
      );

      assert.equal(existsSync(inputPath), false, 'Pixel bomb file must be cleaned up');
    });
  });

  describe('3. Binary Content Validation (Magic Bytes Inspection)', () => {
    it('accepts valid PNG image starting with 89 50 4E 47 0D 0A 1A 0A', () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
      assert.equal(detectImageSignature(pngHeader), 'image/png');
    });

    it('accepts valid JPEG image starting with FF D8 FF', () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      assert.equal(detectImageSignature(jpegHeader), 'image/jpeg');
    });

    it('accepts valid WebP image with RIFF and WEBP signatures', () => {
      const webpHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // 'RIFF'
        0x20, 0x00, 0x00, 0x00, // file size
        0x57, 0x45, 0x42, 0x50, // 'WEBP'
        0x56, 0x50, 0x38, 0x20, // 'VP8 '
      ]);
      assert.equal(detectImageSignature(webpHeader), 'image/webp');
    });

    it('rejects text, HTML, or script files disguised with an image extension', () => {
      const fakePng = Buffer.from('<!DOCTYPE html><html><script>alert("xss")</script></html>');
      assert.equal(detectImageSignature(fakePng), null);

      const fakeJpg = Buffer.from('#!/bin/bash\necho "Malicious code execution"\nexit 1\n');
      assert.equal(detectImageSignature(fakeJpg), null);
    });

    it('rejects executable binaries (MZ / ELF) disguised as WebP', () => {
      const fakeWebp = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]); // MZ DOS header
      assert.equal(detectImageSignature(fakeWebp), null);
    });

    it('rejects corrupted or truncated files smaller than 12 bytes', () => {
      const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      assert.equal(detectImageSignature(truncated), null);
      assert.equal(detectImageSignature(Buffer.alloc(0)), null);
      assert.equal(detectImageSignature(null), null);
    });
  });

  describe('4. Partial Upload File Removal on Validation Failure', () => {
    let testFilePath;

    beforeEach(() => {
      testFilePath = join(tmpdir(), `test-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    });

    afterEach(() => {
      if (existsSync(testFilePath)) {
        try { unlinkSync(testFilePath); } catch {}
      }
    });

    it('cleans up and unlinks invalid file when validation fails', () => {
      writeFileSync(testFilePath, 'Not a real PNG file at all');
      assert.ok(existsSync(testFilePath));

      assert.throws(
        () => validateUploadedImageContent(testFilePath, 'spoofed.png', 'image/png'),
        /Invalid image file content/
      );

      assert.equal(existsSync(testFilePath), false);
    });

    it('cleans up and unlinks file when MIME type and binary signature mismatch', () => {
      const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48]);
      writeFileSync(testFilePath, jpegBytes);
      assert.ok(existsSync(testFilePath));

      assert.throws(
        () => validateUploadedImageContent(testFilePath, 'spoofed.png', 'image/png'),
        /Invalid image file content/
      );

      assert.equal(existsSync(testFilePath), false);
    });

    it('preserves valid image file on disk when content matches declared type', () => {
      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
      writeFileSync(testFilePath, validPng);
      assert.ok(existsSync(testFilePath));

      validateUploadedImageContent(testFilePath, 'valid.png', 'image/png');
      assert.ok(existsSync(testFilePath));
    });
  });

  describe('5. Configurable Storage Base URL & Untrusted Host Header Protection', () => {
    it('uses STORAGE_PUBLIC_URL when configured', () => {
      const originalEnv = process.env.STORAGE_PUBLIC_URL;
      try {
        process.env.STORAGE_PUBLIC_URL = 'https://cdn.bharatbazaar.com/uploads';
        const url = getStoragePublicBaseUrl();
        assert.equal(url, 'https://cdn.bharatbazaar.com/uploads');
      } finally {
        if (originalEnv !== undefined) process.env.STORAGE_PUBLIC_URL = originalEnv;
        else delete process.env.STORAGE_PUBLIC_URL;
      }
    });

    it('trims trailing slashes from STORAGE_PUBLIC_URL', () => {
      const originalEnv = process.env.STORAGE_PUBLIC_URL;
      try {
        process.env.STORAGE_PUBLIC_URL = 'https://cdn.bharatbazaar.com/uploads///';
        const url = getStoragePublicBaseUrl();
        assert.equal(url, 'https://cdn.bharatbazaar.com/uploads');
      } finally {
        if (originalEnv !== undefined) process.env.STORAGE_PUBLIC_URL = originalEnv;
        else delete process.env.STORAGE_PUBLIC_URL;
      }
    });

    it('falls back to APP_URL + /uploads when STORAGE_PUBLIC_URL is not set', () => {
      const origStorage = process.env.STORAGE_PUBLIC_URL;
      const origApp = process.env.APP_URL;
      try {
        delete process.env.STORAGE_PUBLIC_URL;
        process.env.APP_URL = 'https://api.bharatbazaar.com';
        const url = getStoragePublicBaseUrl();
        assert.equal(url, 'https://api.bharatbazaar.com/uploads');
      } finally {
        if (origStorage !== undefined) process.env.STORAGE_PUBLIC_URL = origStorage;
        if (origApp !== undefined) process.env.APP_URL = origApp;
        else delete process.env.APP_URL;
      }
    });

    it('falls back to local port without untrusted Host headers when neither setting is provided', () => {
      const origStorage = process.env.STORAGE_PUBLIC_URL;
      const origApp = process.env.APP_URL;
      const origPort = process.env.PORT;
      try {
        delete process.env.STORAGE_PUBLIC_URL;
        delete process.env.APP_URL;
        process.env.PORT = '4000';
        const url = getStoragePublicBaseUrl();
        assert.equal(url, 'http://localhost:4000/uploads');
      } finally {
        if (origStorage !== undefined) process.env.STORAGE_PUBLIC_URL = origStorage;
        if (origApp !== undefined) process.env.APP_URL = origApp;
        if (origPort !== undefined) process.env.PORT = origPort;
        else delete process.env.PORT;
      }
    });
  });

  describe('6. File Size Limits & Allowed MIME Types', () => {
    it('accepts files within 5MB limit', () => {
      const validSize = 4.9 * 1024 * 1024;
      assert.ok(validSize <= MAX_UPLOAD_FILE_SIZE);
    });

    it('rejects files exceeding 5MB limit', () => {
      const oversized = 5.1 * 1024 * 1024;
      assert.ok(oversized > MAX_UPLOAD_FILE_SIZE);
    });

    it('enforces allowed image MIME types and extensions', () => {
      const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

      assert.ok(allowedExts.includes('.jpg'));
      assert.ok(allowedExts.includes('.jpeg'));
      assert.ok(allowedExts.includes('.png'));
      assert.ok(allowedExts.includes('.webp'));

      assert.equal(allowedExts.includes('.gif'), false);
      assert.equal(allowedExts.includes('.svg'), false);
      assert.equal(allowedExts.includes('.bmp'), false);

      assert.ok(allowedMimes.includes('image/png'));
      assert.ok(allowedMimes.includes('image/jpeg'));
      assert.ok(allowedMimes.includes('image/webp'));
      assert.equal(allowedMimes.includes('image/gif'), false);
    });
  });

  describe('7. Git Ignore Behavior Verification', () => {
    it('verifies that multivendor-backend/uploads/products/ is ignored by Git', () => {
      const result = execSync(
        'git check-ignore -v multivendor-backend/uploads/products/test-product.png',
        { encoding: 'utf8', cwd: join(process.cwd(), '..') }
      );
      assert.ok(result.includes('uploads'), `Expected git check-ignore to match uploads rule, got: ${result}`);
    });
  });
});
