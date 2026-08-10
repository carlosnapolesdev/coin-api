#!/usr/bin/env bash
set -euo pipefail

# Backup en caliente de Crecik: dump de la BD PostgreSQL + adjuntos subidos,
# todo en un único tar.gz. No para el servicio y no necesita nada instalado en
# el host salvo Docker.
#
# Uso:   ./scripts/backup.sh [directorio-destino]
#        (por defecto: ~/backups/crecik)
#
# Cron sugerido (crontab -e):
#   0 3 * * * $HOME/apps/coin-api/scripts/backup.sh >> $HOME/backups/crecik/backup.log 2>&1

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${1:-$HOME/backups/crecik}"
RETENTION_DAYS=14
STAMP="$(date +%F_%H-%M)"

# Los adjuntos viven en un volumen nombrado, no en una carpeta del repo, y
# Compose le antepone el nombre del proyecto (el del directorio). Preguntárselo
# al contenedor evita adivinar ese prefijo; el fallback cubre el caso de que la
# API esté parada justo cuando corre el cron.
VOLUME="${COIN_API_UPLOADS_VOLUME:-$(docker inspect coin-api \
  -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true)}"
VOLUME="${VOLUME:-$(basename "$APP_DIR")_uploads}"

if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  echo "ERROR: no existe el volumen '$VOLUME'. Comprueba 'docker volume ls' y" \
       "fija COIN_API_UPLOADS_VOLUME si el proyecto Compose tiene otro nombre." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

DUMP="$BACKUP_DIR/.crecik-$STAMP.dump"
trap 'rm -f "$DUMP"' EXIT

# pg_dump del propio contenedor de postgres: sus binarios siempre casan con la
# versión del servidor, y el socket local del contenedor va en trust, así que no
# hace falta contraseña. Si algún día se endurece pg_hba, exportar PGPASSWORD.
# El dump ya es un snapshot transaccional consistente; no hay que parar nada.
#
# Se hace ANTES de copiar los adjuntos a propósito. Si en esos segundos alguien
# sube un fichero, queda huérfano en el backup (inofensivo); al revés, la BD
# referenciaría un adjunto que no está en el tar, y eso sí se ve roto al
# restaurar. Las altas son mucho más frecuentes que las bajas.
docker exec postgres pg_dump -U postgres -Fc crecik > "$DUMP"

# El resto ocurre dentro de un contenedor efímero: la app corre como root, así
# que los ficheros del volumen son de root y el host no podría leerlos. El
# volumen se monta :ro porque aquí solo se lee.
docker run --rm \
  -e STAMP="$STAMP" \
  -v "$VOLUME:/uploads:ro" \
  -v "$BACKUP_DIR:/backup" \
  alpine:3 sh -ec '
    mkdir -p /tmp/crecik/uploads
    cp -a /uploads/. /tmp/crecik/uploads/
    cp "/backup/.crecik-$STAMP.dump" /tmp/crecik/db.dump
    tar czf "/backup/crecik-$STAMP.tar.gz" -C /tmp/crecik .
  '

# Retención: elimina backups con más de RETENTION_DAYS días.
find "$BACKUP_DIR" -name 'crecik-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "OK $(date '+%F %T'): $BACKUP_DIR/crecik-$STAMP.tar.gz"
