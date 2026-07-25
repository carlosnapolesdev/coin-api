import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envValidationSchema } from './env.validation';

/**
 * El `.env` del VPS y el de desarrollo no llevan lo mismo, y suponer que sí
 * cuesta un arranque caído: `.env.production.example` existe para que no haya
 * que adivinarlo. Pero una plantilla que se queda atrás miente igual que no
 * tenerla, y nada en el flujo de trabajo obliga a actualizarla. Estos tests son
 * ese obligar.
 *
 * Se parsea el compose a mano en vez de con js-yaml: solo está instalado como
 * dependencia transitiva, y añadirlo al proyecto para leer dos bloques de un
 * fichero que escribimos nosotros no sale a cuenta.
 */
const repoRoot = join(__dirname, '../..');
const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf-8');
const template = readFileSync(
  join(repoRoot, '.env.production.example'),
  'utf-8',
);

/** Claves que Compose resuelve desde el `.env` de su directorio. */
const interpolatedByCompose = new Set(
  [...compose.matchAll(/\$\{([A-Z_]+)/g)].map((m) => m[1]),
);

/** Claves que Compose inyecta al contenedor (literales incluidas). */
const injectedIntoContainer = new Set(
  [...compose.matchAll(/^ {6}([A-Z_]+):/gm)].map((m) => m[1]),
);

/** Claves declaradas en la plantilla, comentarios aparte. */
const declaredInTemplate = new Set(
  [...template.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]),
);

/**
 * Lo que Joi exige en producción, deducido del propio esquema en vez de
 * repetido a mano: una lista copiada aquí envejecería sin avisar.
 */
function requiredInProduction(): string[] {
  const { error } = envValidationSchema.validate(
    { NODE_ENV: 'production' },
    { abortEarly: false, allowUnknown: true },
  );
  return (error?.details ?? [])
    .map((d) => String(d.path[0]))
    .filter((key) => key.length > 0);
}

describe('.env.production.example', () => {
  it('declares every key the compose file interpolates', () => {
    const missing = [...interpolatedByCompose].filter(
      (key) => !declaredInTemplate.has(key),
    );
    expect(missing).toEqual([]);
  });

  it('declares no key the compose file never reads', () => {
    // Una clave de más es peor que inútil: hace creer que se aplica. NODE_ENV o
    // DATABASE_URL puestas aquí las ignora Compose, que las fija por su cuenta.
    const unused = [...declaredInTemplate].filter(
      (key) => !interpolatedByCompose.has(key),
    );
    expect(unused).toEqual([]);
  });
});

describe('docker-compose.yml', () => {
  it('injects every variable Joi requires in production', () => {
    // El fallo real que documenta el runbook: GOOGLE_CLIENT_ID estaba en el
    // `.env` del VPS pero no en el bloque `environment:`, así que nunca llegó a
    // la app y el contenedor arrancó en bucle con "is required in production".
    const missing = requiredInProduction().filter(
      (key) => !injectedIntoContainer.has(key),
    );
    expect(missing).toEqual([]);
  });

  it('fails closed at `compose up` for those same variables', () => {
    // Sin el `:?`, una clave ausente se interpola como cadena vacía y el fallo
    // aparece más tarde y más lejos: mejor que aborte el propio `compose up`.
    const withoutGuard = requiredInProduction()
      .filter((key) => interpolatedByCompose.has(key))
      .filter((key) => !compose.includes(`\${${key}:?`));
    expect(withoutGuard).toEqual([]);
  });
});
