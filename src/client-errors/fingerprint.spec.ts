import { computeFingerprint } from './fingerprint';

describe('computeFingerprint', () => {
  const stack = [
    'TypeError: x is not a function',
    '    at loadAccounts (https://crecik.com/assets/index-abc123.js:10:25)',
    '    at onMounted (https://crecik.com/assets/index-abc123.js:44:9)',
    '    at callHook (https://crecik.com/assets/vendor-def456.js:99:3)',
    '    at flushJobs (https://crecik.com/assets/vendor-def456.js:120:7)',
  ].join('\n');

  it('is a 64-char hex digest', () => {
    expect(computeFingerprint('a', 'TypeError', stack)).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('groups the same error across rebuilds', () => {
    // Distinto hash de bundle y distintas líneas: mismo fallo, mismo grupo.
    const afterRebuild = stack
      .replace(/index-abc123/g, 'index-zzz999')
      .replace(/vendor-def456/g, 'vendor-yyy888')
      .replace(/:10:25/, ':11:30');

    expect(computeFingerprint('a', 'TypeError', afterRebuild)).toBe(
      computeFingerprint('a', 'TypeError', stack),
    );
  });

  it('separates different contexts', () => {
    expect(computeFingerprint('a', 'TypeError', stack)).not.toBe(
      computeFingerprint('b', 'TypeError', stack),
    );
  });

  it('separates different error names', () => {
    expect(computeFingerprint('a', 'TypeError', stack)).not.toBe(
      computeFingerprint('a', 'RangeError', stack),
    );
  });

  it('ignores frames beyond the third', () => {
    const deeperDiff = stack.replace('at flushJobs', 'at somethingElse');
    expect(computeFingerprint('a', 'TypeError', deeperDiff)).toBe(
      computeFingerprint('a', 'TypeError', stack),
    );
  });

  it('falls back to context and name when there is no stack', () => {
    expect(computeFingerprint('a', 'TypeError', undefined)).toBe(
      computeFingerprint('a', 'TypeError', ''),
    );
  });
});
