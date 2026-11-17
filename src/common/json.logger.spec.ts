import { JsonLogger } from './json.logger';
import { ConfigService } from '@nestjs/config';

function makeLogger() {
  const config = { get: (_k: string, d?: string) => d ?? 'info' } as unknown as ConfigService;
  return new JsonLogger(config);
}

describe('JsonLogger — masquage (§2.2)', () => {
  let logs: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    logs = [];
    spy = jest.spyOn(console, 'log').mockImplementation((line: string) => logs.push(line));
  });

  afterEach(() => spy.mockRestore());

  it('masque les champs sensibles et PII', () => {
    const logger = makeLogger();
    logger.log('test.event', 'test.ctx', {
      password: 'secret123',
      card_number: '4111111111111111',
      telephone: '+22890123456',
      email: 'jean.dupont@gmail.com',
      montant_centimes: 500000,
    });

    expect(logs).toHaveLength(1);
    const entry = JSON.parse(logs[0]);
    expect(entry.level).toBe('info');
    expect(entry.service).toBe('svc-api');
    expect(entry.event).toBe('test.event');
    expect(entry.context.password).toBe('[REDACTED]');
    expect(entry.context.card_number).toBe('[REDACTED]');
    expect(entry.context.telephone).toMatch(/•/);
    expect(entry.context.email).toMatch(/•/);
    expect(entry.context.montant_centimes).toBe(500000);
    expect(logs[0]).not.toContain('secret123');
    expect(logs[0]).not.toContain('4111111111111111');
  });

  it('tronque les longues chaînes', () => {
    const logger = makeLogger();
    logger.log('test.long', 'ctx', { data: 'x'.repeat(500) });
    const entry = JSON.parse(logs[0]);
    expect(JSON.stringify(entry.context.data).length).toBeLessThan(300);
  });
});
