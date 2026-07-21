/*
  Warnings:

  - A unique constraint covering the columns `[google_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "google_id" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "uk_users_google_id" ON "users"("google_id");
