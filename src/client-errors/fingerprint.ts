import * as crypto from 'crypto';

const FRAMES_USED = 3;

/**
 * Quita lo que cambia entre builds sin que el error sea otro: hashes de bundle
 * en los nombres de fichero y posiciones línea:columna. Sin esto, cada deploy
 * crearía grupos nuevos para los mismos fallos.
 */
function normalizeFrame(frame: string): string {
  return frame
    .trim()
    .replace(/-[0-9a-zA-Z_]{6,}\.(js|mjs|ts)/g, '.$1')
    .replace(/:\d+:\d+/g, '');
}

export function computeFingerprint(
  context: string,
  errorName: string,
  stack: string | undefined,
): string {
  const frames = (stack ?? '')
    .split('\n')
    .filter((line) => line.trim().startsWith('at '))
    .slice(0, FRAMES_USED)
    .map(normalizeFrame);

  const material = [context, errorName, ...frames].join('|');
  return crypto.createHash('sha256').update(material).digest('hex');
}
