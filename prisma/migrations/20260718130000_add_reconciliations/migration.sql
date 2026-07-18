-- CreateTable
CREATE TABLE "reconciliations" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "account_id" BIGINT NOT NULL,
    "statement_date" DATE NOT NULL,
    "statement_balance" DECIMAL(15,2) NOT NULL,
    "cleared_balance" DECIMAL(15,2) NOT NULL,
    "difference" DECIMAL(15,2) NOT NULL,
    "is_completed" BOOLEAN DEFAULT false,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_reconciliations_account_id" ON "reconciliations"("account_id");

-- CreateIndex
CREATE INDEX "idx_reconciliations_user_id" ON "reconciliations"("user_id");

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "fk_reconciliation_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "fk_reconciliation_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
