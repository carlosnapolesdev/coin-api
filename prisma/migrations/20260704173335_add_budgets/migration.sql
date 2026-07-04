-- CreateTable
CREATE TABLE "budgets" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "category_id" BIGINT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "period" VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
    "start_date" DATE NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_budgets_user_id" ON "budgets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_budget_user_category_period" ON "budgets"("user_id", "category_id", "period");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "fk_budget_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "fk_budget_category" FOREIGN KEY ("category_id") REFERENCES "user_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
