-- CreateTable
CREATE TABLE "recurring_transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "account_id" BIGINT NOT NULL,
    "category_id" BIGINT,
    "destination_account_id" BIGINT,
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "frequency" VARCHAR(20) NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "next_run_date" DATE NOT NULL,
    "last_run_date" DATE,
    "end_date" DATE,
    "payee" VARCHAR(255),
    "memo" TEXT,
    "tags" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_recurring_user_id" ON "recurring_transactions"("user_id");

-- CreateIndex
CREATE INDEX "idx_recurring_next_run_date" ON "recurring_transactions"("next_run_date", "is_active");

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "fk_recurring_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "fk_recurring_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "fk_recurring_destination_account" FOREIGN KEY ("destination_account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "fk_recurring_category" FOREIGN KEY ("category_id") REFERENCES "user_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
