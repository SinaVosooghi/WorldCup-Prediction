import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  let service: SmsService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should initialize with MockSmsProvider in sandbox mode', () => {
      mockConfigService.get.mockReturnValue(true);

      const sandboxService = new SmsService(configService);
      expect(sandboxService).toBeDefined();
    });

    it('should initialize with ProductionSmsProvider in production mode', () => {
      mockConfigService.get.mockReturnValue(false);

      const prodService = new SmsService(configService);
      expect(prodService).toBeDefined();
    });
  });

  describe('sendOtpSms', () => {
    describe('sandbox mode', () => {
      beforeEach(() => {
        mockConfigService.get.mockReturnValue(true);
      });

      it('should send OTP successfully in sandbox mode', async () => {
        const phone = '+989123456789';
        const code = '123456';

        await expect(service.sendOtpSms(phone, code)).resolves.not.toThrow();
      });

      it('should handle invalid phone number', async () => {
        const phone = '123'; // Too short
        const code = '123456';

        await expect(service.sendOtpSms(phone, code)).rejects.toThrow();
      });

      it('should handle invalid OTP code', async () => {
        const phone = '+989123456789';
        const code = 'abc'; // Non-numeric

        await expect(service.sendOtpSms(phone, code)).rejects.toThrow();
      });

      it('should handle short OTP code', async () => {
        const phone = '+989123456789';
        const code = '12'; // Too short

        await expect(service.sendOtpSms(phone, code)).rejects.toThrow();
      });
    });

    describe('production mode', () => {
      beforeEach(() => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'sms.sandbox') return false;
          if (key === 'sms.apiKey') return null; // No API key configured
          return undefined;
        });
      });

      it('should handle missing API key gracefully', async () => {
        const phone = '+989123456789';
        const code = '123456';

        // Should not throw even without API key (logs warning instead)
        await expect(service.sendOtpSms(phone, code)).resolves.not.toThrow();
      });

      it('should validate phone number in production mode', async () => {
        const phone = 'invalid';
        const code = '123456';

        await expect(service.sendOtpSms(phone, code)).rejects.toThrow();
      });
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue(true);
    });

    it('should propagate errors from provider', async () => {
      const phone = ''; // Empty phone number
      const code = '123456';

      await expect(service.sendOtpSms(phone, code)).rejects.toThrow();
    });

    it('should handle empty code', async () => {
      const phone = '+989123456789';
      const code = '';

      await expect(service.sendOtpSms(phone, code)).rejects.toThrow();
    });
  });

  describe('different phone formats', () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue(true);
    });

    it('should handle phone with country code', async () => {
      const phone = '+989123456789';
      const code = '123456';

      await expect(service.sendOtpSms(phone, code)).resolves.not.toThrow();
    });

    it('should handle phone without country code', async () => {
      const phone = '09123456789';
      const code = '123456';

      await expect(service.sendOtpSms(phone, code)).resolves.not.toThrow();
    });

    it('should handle international format', async () => {
      const phone = '00989123456789';
      const code = '123456';

      await expect(service.sendOtpSms(phone, code)).resolves.not.toThrow();
    });
  });

  describe('different OTP code lengths', () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue(true);
    });

    it('should handle 4-digit OTP', async () => {
      const phone = '+989123456789';
      const code = '1234';

      await expect(service.sendOtpSms(phone, code)).resolves.not.toThrow();
    });

    it('should handle 6-digit OTP', async () => {
      const phone = '+989123456789';
      const code = '123456';

      await expect(service.sendOtpSms(phone, code)).resolves.not.toThrow();
    });

    it('should handle 8-digit OTP', async () => {
      const phone = '+989123456789';
      const code = '12345678';

      await expect(service.sendOtpSms(phone, code)).resolves.not.toThrow();
    });
  });
});
