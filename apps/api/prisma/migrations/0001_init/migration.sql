-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('trial', 'starter', 'growth', 'enterprise');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('static', 'parametric');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('mesh', 'texture', 'usdz', 'thumb', 'sprite360');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'quoted', 'won', 'lost');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'trial',
    "branding" JSONB NOT NULL DEFAULT '{}',
    "limits" JSONB NOT NULL DEFAULT '{}',
    "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'manager',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "type" "ProductType" NOT NULL DEFAULT 'static',
    "base_price_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "widthMm" INTEGER,
    "heightMm" INTEGER,
    "depthMm" INTEGER,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID,
    "kind" "AssetKind" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'pending',
    "uri" TEXT NOT NULL,
    "lod_level" INTEGER NOT NULL DEFAULT 0,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "tri_count" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT NOT NULL,
    "report" JSONB NOT NULL DEFAULT '{}',
    "error_text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pbr" JSONB NOT NULL DEFAULT '{}',
    "tiling_mm" INTEGER NOT NULL DEFAULT 1000,
    "price_modifier_cents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ui_type" TEXT NOT NULL DEFAULT 'swatch',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "options" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price_delta_cents" INTEGER NOT NULL DEFAULT 0,
    "sku_suffix" TEXT,
    "asset_ref" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "dsl" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "owner_session" TEXT NOT NULL,
    "share_code" TEXT NOT NULL,
    "doc" JSONB NOT NULL,
    "doc_version" INTEGER NOT NULL DEFAULT 1,
    "preview_uri" TEXT,
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "scene_id" UUID,
    "contact" JSONB NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "products_tenant_id_category_idx" ON "products"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "products_tenant_id_published_idx" ON "products"("tenant_id", "published");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "assets_tenant_id_status_idx" ON "assets"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "assets_product_id_idx" ON "assets"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenant_id_checksum_kind_lod_level_key" ON "assets"("tenant_id", "checksum", "kind", "lod_level");

-- CreateIndex
CREATE INDEX "materials_tenant_id_idx" ON "materials"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "materials_tenant_id_code_key" ON "materials"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "option_groups_tenant_id_idx" ON "option_groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "option_groups_product_id_code_key" ON "option_groups"("product_id", "code");

-- CreateIndex
CREATE INDEX "options_tenant_id_idx" ON "options"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "options_group_id_code_key" ON "options"("group_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "product_rules_product_id_key" ON "product_rules"("product_id");

-- CreateIndex
CREATE INDEX "product_rules_tenant_id_idx" ON "product_rules"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_share_code_key" ON "scenes"("share_code");

-- CreateIndex
CREATE INDEX "scenes_tenant_id_owner_session_idx" ON "scenes"("tenant_id", "owner_session");

-- CreateIndex
CREATE INDEX "scenes_tenant_id_updatedAt_idx" ON "scenes"("tenant_id", "updatedAt");

-- CreateIndex
CREATE INDEX "leads_tenant_id_status_createdAt_idx" ON "leads"("tenant_id", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "options" ADD CONSTRAINT "options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rules" ADD CONSTRAINT "product_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

