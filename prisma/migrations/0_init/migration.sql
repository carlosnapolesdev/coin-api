-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "username" VARCHAR(50),
    "email" VARCHAR(150),
    "password_hash" VARCHAR(255),
    "full_name" VARCHAR(100),
    "language" VARCHAR(10) DEFAULT 'en',
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "institution" VARCHAR(150),
    "type" VARCHAR(20) NOT NULL DEFAULT 'NO_TYPE',
    "account_number" VARCHAR(50),
    "currency_id" BIGINT,
    "group_name" VARCHAR(100),
    "start_balance" DECIMAL(15,2) DEFAULT 0,
    "notes" TEXT,
    "icon" VARCHAR(50),
    "is_closed" BOOLEAN DEFAULT false,
    "is_active" BOOLEAN DEFAULT true,
    "default_template" VARCHAR(30) NOT NULL DEFAULT 'NONE',
    "exclude_from_account_summary" BOOLEAN DEFAULT false,
    "outline_into_summary" BOOLEAN DEFAULT false,
    "exclude_from_budget" BOOLEAN DEFAULT false,
    "exclude_from_any_reports" BOOLEAN DEFAULT false,
    "overdraft_at" DECIMAL(15,2) DEFAULT 0,
    "maximum_balance" DECIMAL(15,2) DEFAULT 0,
    "checkbook1" INTEGER DEFAULT 0,
    "checkbook2" INTEGER DEFAULT 0,
    "user_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(50),
    "parent_id" BIGINT,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_translations" (
    "id" BIGSERIAL NOT NULL,
    "category_id" BIGINT NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "symbol" VARCHAR(10),
    "created_at" TIMESTAMPTZ(6),

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "account_id" BIGINT NOT NULL,
    "category_id" BIGINT,
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "effective_date" DATE NOT NULL,
    "payee" VARCHAR(255),
    "payment_method" VARCHAR(100),
    "memo" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'CLEARED',
    "tags" TEXT,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_categories" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(50),
    "is_active" BOOLEAN,
    "is_custom" BOOLEAN,
    "parent_id" BIGINT,
    "source_category_id" BIGINT,
    "user_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_currencies" (
    "currency_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "exchange_rate" DECIMAL(15,6),
    "is_base" BOOLEAN,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_currencies_pkey" PRIMARY KEY ("currency_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uk_users_username" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "uk_users_email" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ct_category_language" ON "category_translations"("category_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "uk_currencies_code" ON "currencies"("code");

-- CreateIndex
CREATE INDEX "idx_transactions_account_id" ON "transactions"("account_id");

-- CreateIndex
CREATE INDEX "idx_transactions_effective_date" ON "transactions"("effective_date");

-- CreateIndex
CREATE INDEX "idx_transactions_user_id" ON "transactions"("user_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "fk_account_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "fk_account_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "fk_category_parent" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "fk_ct_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "fk_transaction_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "fk_transaction_category" FOREIGN KEY ("category_id") REFERENCES "user_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "fk_transaction_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_categories" ADD CONSTRAINT "fk_uc_parent_category" FOREIGN KEY ("parent_id") REFERENCES "user_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_categories" ADD CONSTRAINT "fk_uc_source_category" FOREIGN KEY ("source_category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_categories" ADD CONSTRAINT "fk_uc_user_category" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_currencies" ADD CONSTRAINT "fk_uc_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_currencies" ADD CONSTRAINT "fk_uc_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

