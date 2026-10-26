import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BrevoEmailService } from '../src/email/brevo-email.service';

describe('Auth OTP Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const mockBrevoSendOtp = jest.fn().mockResolvedValue({ messageId: 'mock-e2e-msg-id' });

  const testUser = {
    email: `otp-e2e-${Date.now()}@example.com`,
    password: 'Password123!',
    firstName: 'Pooja',
    lastName: 'Sri',
    phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
  };

  let registeredDevOtp: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BrevoEmailService)
      .useValue({
        hasValidConfiguration: () => true,
        sendOtpEmail: mockBrevoSendOtp,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await prisma.emailOtp.deleteMany({ where: { email: testUser.email } });
      await prisma.emailVerificationToken.deleteMany({
        where: { user: { email: testUser.email } },
      });
      await prisma.userSession.deleteMany({
        where: { user: { email: testUser.email } },
      });
      await prisma.user.deleteMany({ where: { email: testUser.email } });
    } catch {
      // teardown fallback
    }
    await app.close();
  });

  it('1. POST /api/v1/auth/register should create an unverified user, return phone and emailVerified: false, and send OTP via Brevo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);

    expect(res.body.message).toContain('Registration successful');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.phone).toBe(testUser.phone);
    expect(res.body.user.isEmailVerified).toBe(false);
    expect(res.body.devOtp).toMatch(/^\d{6}$/);

    registeredDevOtp = res.body.devOtp;
    expect(mockBrevoSendOtp).toHaveBeenCalled();
  });

  it('2. POST /api/v1/auth/login should block unverified user from logging in', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(401);

    expect(res.body.message).toContain('Please verify your email');
  });

  it('3. POST /api/v1/auth/otp/verify should reject invalid OTP format or wrong code', async () => {
    // 5-digit code fails ValidationPipe
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        email: testUser.email,
        otp: '12345',
      })
      .expect(400);

    // Wrong 6-digit code fails verification
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        email: testUser.email,
        otp: '000000',
      })
      .expect(400);

    expect(res.body.message).toContain('Invalid verification code');
  });

  it('4. POST /api/v1/auth/otp/resend should enforce cooldown', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/resend')
      .send({ email: testUser.email })
      .expect(429);

    expect(res.body.message).toContain('Please wait');
  });

  it('5. POST /api/v1/auth/otp/verify should verify email with the correct OTP and activate user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        email: testUser.email,
        otp: registeredDevOtp,
      })
      .expect(200);

    expect(res.body.message).toContain('Email verified successfully');
  });

  it('6. POST /api/v1/auth/otp/verify should reject reused OTP', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        email: testUser.email,
        otp: registeredDevOtp,
      })
      .expect(400);

    expect(res.body.message).toMatch(/Invalid or expired verification code|already been used/);
  });

  it('7. POST /api/v1/auth/login should now succeed for the verified user and include phone and isEmailVerified: true', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.phone).toBe(testUser.phone);
    expect(res.body.user.isEmailVerified).toBe(true);
  });
});
