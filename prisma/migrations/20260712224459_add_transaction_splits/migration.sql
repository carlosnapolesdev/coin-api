-- CreateTable
CREATE TABLE "transaction_splits" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" BIGINT NOT NULL,
    "category_id" BIGINT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_transaction_splits_transaction_id" ON "transaction_splits"("transaction_id");

-- CreateIndex
CREATE INDEX "idx_transaction_splits_category_id" ON "transaction_splits"("category_id");

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "user_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
