import { resolveCorsOrigin } from './cors';

describe('resolveCorsOrigin', () => {
  it('splits a comma-separated list into trimmed origins', () => {
    expect(
      resolveCorsOrigin(
        ' https://app.example.com , https://other.example.com ',
        'production',
      ),
    ).toEqual(['https://app.example.com', 'https://other.example.com']);
  });

  it('drops empty entries from the list', () => {
    expect(
      resolveCorsOrigin('https://app.example.com,,', 'production'),
    ).toEqual(['https://app.example.com']);
  });

  it('allows any origin in development when unset', () => {
    expect(resolveCorsOrigin(undefined, 'development')).toBe(true);
    expect(resolveCorsOrigin('', 'development')).toBe(true);
  });

  it('disables cross-origin access in production when unset', () => {
    expect(resolveCorsOrigin(undefined, 'production')).toBe(false);
    expect(resolveCorsOrigin('', 'production')).toBe(false);
  });
});
