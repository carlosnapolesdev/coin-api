-- CreateTable
CREATE TABLE "client_errors" (
    "id" BIGSERIAL NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "context" VARCHAR(100) NOT NULL,
    "error_name" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "url" VARCHAR(500),
    "user_agent" VARCHAR(300),
    "app_version" VARCHAR(50),
    "user_id" BIGINT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMPTZ(6),

    CONSTRAINT "client_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uk_client_errors_fingerprint" ON "client_errors"("fingerprint");

-- CreateIndex
CREATE INDEX "idx_client_errors_last_seen_at" ON "client_errors"("last_seen_at");
