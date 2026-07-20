import { credentialsCutoff } from './credentials-cutoff';

describe('credentialsCutoff', () => {
  it('truncates sub-second precision', () => {
    expect(credentialsCutoff(new Date(1_000_400)).getTime()).toBe(1_000_000);
  });

  it('leaves a whole second untouched', () => {
    expect(credentialsCutoff(new Date(1_000_000)).getTime()).toBe(1_000_000);
  });
});
