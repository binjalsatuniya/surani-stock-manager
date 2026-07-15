-- Required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Financial year is always derived from a row's `date`, never entered directly, so it can
-- never drift. Apr(y)-Mar(y+1), label format "2025-26". Must match packages/shared/src/fy.ts.
CREATE OR REPLACE FUNCTION fy_of_date(d date) RETURNS text AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM d) >= 4
      THEN EXTRACT(YEAR FROM d)::text || '-' || LPAD((EXTRACT(YEAR FROM d)::int + 1 - 2000)::text, 2, '0')
    ELSE (EXTRACT(YEAR FROM d)::int - 1)::text || '-' || LPAD((EXTRACT(YEAR FROM d)::int - 2000)::text, 2, '0')
  END;
$$ LANGUAGE sql IMMUTABLE;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "username" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "security" JSONB NOT NULL DEFAULT '{}',
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_label" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sales_person_id" UUID,
    "phone" TEXT,
    "email" TEXT,
    "gst" TEXT,
    "opening" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "default_freight" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "address" TEXT,
    "location_url" TEXT,
    "vehicle" TEXT,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL,
    "code" TEXT,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "opening" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorder" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "rate_date" DATE,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inward" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "financial_year" TEXT GENERATED ALWAYS AS (fy_of_date("date")) STORED,
    "party_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "gst_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "handling_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "handling" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "handling_agent_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "inv_no" TEXT,
    "inv_date" DATE,
    "delivery_type" TEXT,
    "transporter_id" UUID,
    "freight_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vehicle" TEXT,
    "note" TEXT,
    "created_by" UUID,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outward" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "financial_year" TEXT GENERATED ALWAYS AS (fy_of_date("date")) STORED,
    "party_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "freight_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gst_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "handling_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "handling" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "handling_agent_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "pay_status" TEXT NOT NULL DEFAULT 'pending',
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "inv_no" TEXT,
    "inv_date" DATE,
    "delivery_type" TEXT,
    "transporter_id" UUID,
    "vehicle" TEXT,
    "fulfil" TEXT NOT NULL DEFAULT 'pending',
    "prev_fulfil" TEXT,
    "dispatched_at" DATE,
    "delivered_at" DATE,
    "cancelled_at" DATE,
    "cancelled_by" UUID,
    "note" TEXT,
    "created_by" UUID,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "financial_year" TEXT GENERATED ALWAYS AS (fy_of_date("date")) STORED,
    "party_id" UUID NOT NULL,
    "dir" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" TEXT NOT NULL,
    "allocations" JSONB,
    "note" TEXT,
    "created_by" UUID,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "outward_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "transporter_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "freight" DECIMAL(14,2) NOT NULL,
    "freight_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "inward_id" UUID,
    "outward_id" UUID,
    "inv_no" TEXT,
    "note" TEXT,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freight_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handling_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "handling_agent_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "handling_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "source_id" UUID NOT NULL,
    "source_kind" TEXT NOT NULL,
    "inv_no" TEXT,
    "note" TEXT,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handling_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_by" UUID NOT NULL,
    "resolved_by" UUID,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "legacy_id" TEXT,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "target_id" UUID,
    "label" TEXT,
    "details" JSONB,
    "actor_id" UUID,
    "actor_name" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacy_id" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_years" (
    "label" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_years_pkey" PRIMARY KEY ("label")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_legacy_id_key" ON "users"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_persons_legacy_id_key" ON "sales_persons"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "parties_legacy_id_key" ON "parties"("legacy_id");

-- CreateIndex
CREATE INDEX "parties_type_idx" ON "parties"("type");

-- CreateIndex
CREATE INDEX "parties_sales_person_id_idx" ON "parties"("sales_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_legacy_id_key" ON "items"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "inward_legacy_id_key" ON "inward"("legacy_id");

-- CreateIndex
CREATE INDEX "inward_financial_year_idx" ON "inward"("financial_year");

-- CreateIndex
CREATE INDEX "inward_party_id_idx" ON "inward"("party_id");

-- CreateIndex
CREATE INDEX "inward_item_id_idx" ON "inward"("item_id");

-- CreateIndex
CREATE INDEX "inward_date_idx" ON "inward"("date");

-- CreateIndex
CREATE UNIQUE INDEX "outward_legacy_id_key" ON "outward"("legacy_id");

-- CreateIndex
CREATE INDEX "outward_financial_year_idx" ON "outward"("financial_year");

-- CreateIndex
CREATE INDEX "outward_party_id_idx" ON "outward"("party_id");

-- CreateIndex
CREATE INDEX "outward_item_id_idx" ON "outward"("item_id");

-- CreateIndex
CREATE INDEX "outward_fulfil_idx" ON "outward"("fulfil");

-- CreateIndex
CREATE INDEX "outward_pay_status_idx" ON "outward"("pay_status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_legacy_id_key" ON "payments"("legacy_id");

-- CreateIndex
CREATE INDEX "payments_financial_year_idx" ON "payments"("financial_year");

-- CreateIndex
CREATE INDEX "payments_party_id_idx" ON "payments"("party_id");

-- CreateIndex
CREATE INDEX "payment_allocations_outward_id_idx" ON "payment_allocations"("outward_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_outward_id_key" ON "payment_allocations"("payment_id", "outward_id");

-- CreateIndex
CREATE UNIQUE INDEX "freight_entries_legacy_id_key" ON "freight_entries"("legacy_id");

-- CreateIndex
CREATE INDEX "freight_entries_transporter_id_idx" ON "freight_entries"("transporter_id");

-- CreateIndex
CREATE INDEX "freight_entries_outward_id_idx" ON "freight_entries"("outward_id");

-- CreateIndex
CREATE INDEX "freight_entries_inward_id_idx" ON "freight_entries"("inward_id");

-- CreateIndex
CREATE UNIQUE INDEX "handling_entries_legacy_id_key" ON "handling_entries"("legacy_id");

-- CreateIndex
CREATE INDEX "handling_entries_handling_agent_id_idx" ON "handling_entries"("handling_agent_id");

-- CreateIndex
CREATE INDEX "handling_entries_source_id_source_kind_idx" ON "handling_entries"("source_id", "source_kind");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_legacy_id_key" ON "approval_requests"("legacy_id");

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_legacy_id_key" ON "audit_log"("legacy_id");

-- CreateIndex
CREATE INDEX "audit_log_target_target_id_idx" ON "audit_log"("target", "target_id");

-- CreateIndex
CREATE INDEX "audit_log_timestamp_idx" ON "audit_log"("timestamp" DESC);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_sales_person_id_fkey" FOREIGN KEY ("sales_person_id") REFERENCES "sales_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward" ADD CONSTRAINT "inward_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward" ADD CONSTRAINT "inward_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward" ADD CONSTRAINT "inward_handling_agent_id_fkey" FOREIGN KEY ("handling_agent_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward" ADD CONSTRAINT "inward_transporter_id_fkey" FOREIGN KEY ("transporter_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward" ADD CONSTRAINT "inward_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward" ADD CONSTRAINT "outward_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward" ADD CONSTRAINT "outward_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward" ADD CONSTRAINT "outward_handling_agent_id_fkey" FOREIGN KEY ("handling_agent_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward" ADD CONSTRAINT "outward_transporter_id_fkey" FOREIGN KEY ("transporter_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward" ADD CONSTRAINT "outward_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward" ADD CONSTRAINT "outward_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_outward_id_fkey" FOREIGN KEY ("outward_id") REFERENCES "outward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_entries" ADD CONSTRAINT "freight_entries_transporter_id_fkey" FOREIGN KEY ("transporter_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_entries" ADD CONSTRAINT "freight_entries_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_entries" ADD CONSTRAINT "freight_entries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_entries" ADD CONSTRAINT "freight_entries_inward_id_fkey" FOREIGN KEY ("inward_id") REFERENCES "inward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_entries" ADD CONSTRAINT "freight_entries_outward_id_fkey" FOREIGN KEY ("outward_id") REFERENCES "outward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handling_entries" ADD CONSTRAINT "handling_entries_handling_agent_id_fkey" FOREIGN KEY ("handling_agent_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handling_entries" ADD CONSTRAINT "handling_entries_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handling_entries" ADD CONSTRAINT "handling_entries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_years" ADD CONSTRAINT "financial_years_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
