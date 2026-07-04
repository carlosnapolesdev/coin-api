-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "transfer_account_id" BIGINT,
ADD COLUMN     "transfer_group_id" UUID,
ADD COLUMN     "transfer_in" BOOLEAN;

-- CreateIndex
CREATE INDEX "idx_transactions_transfer_group_id" ON "transactions"("transfer_group_id");
