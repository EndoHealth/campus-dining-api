-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('confirmed', 'needs_poc', 'unsupported');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('cataloged', 'adapter_pending', 'adapter_ready', 'poc_required');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('official_api', 'official_html', 'vendor_bonappetit', 'vendor_campusdish', 'vendor_dineoncampus', 'vendor_foodpro', 'vendor_mydininghub', 'vendor_netnutrition', 'vendor_nutrislice', 'vendor_sodexo', 'student_api');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "DataSourceKind" AS ENUM ('official_api', 'official_html', 'official_pdf', 'vendor_api', 'partner_api', 'social_public', 'llm_estimate');

-- CreateEnum
CREATE TYPE "CrawlRunStatus" AS ENUM ('running', 'success', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('dining_hall', 'cafe', 'market', 'retail', 'food_truck', 'popup', 'unknown');

-- CreateEnum
CREATE TYPE "NutritionUnit" AS ENUM ('kcal', 'g', 'mg', 'mcg', 'iu', 'percent_daily_value', 'count', 'other');

-- CreateEnum
CREATE TYPE "NutritionKey" AS ENUM ('calories', 'serving_size', 'servings_per_container', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium', 'caffeine', 'other');

-- CreateEnum
CREATE TYPE "AllergenKey" AS ENUM ('milk', 'egg', 'fish', 'crustacean_shellfish', 'tree_nut', 'peanut', 'wheat', 'soy', 'sesame', 'gluten', 'other');

-- CreateEnum
CREATE TYPE "AllergenStatus" AS ENUM ('contains', 'may_contain', 'made_without', 'unknown');

-- CreateEnum
CREATE TYPE "DietaryTag" AS ENUM ('vegan', 'vegetarian', 'halal', 'kosher', 'gluten_free', 'made_without_gluten', 'dairy_free', 'nut_free', 'low_sodium', 'low_carbon', 'locally_sourced', 'organic', 'plant_forward', 'spicy', 'other');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('available', 'planned', 'sold_out', 'unavailable', 'unknown');

-- CreateEnum
CREATE TYPE "FactSourceKind" AS ENUM ('official', 'provider_derived', 'source_text', 'llm_estimated', 'unavailable');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('pending', 'success', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "timezone" TEXT,
    "providerKind" "ProviderKind" NOT NULL,
    "supportStatus" "SupportStatus" NOT NULL,
    "integrationStatus" "IntegrationStatus" NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "kind" "DataSourceKind" NOT NULL,
    "providerKind" "ProviderKind",
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlRun" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "dataSourceId" TEXT NOT NULL,
    "status" "CrawlRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "requestedDate" DATE,
    "usedDate" DATE,
    "mode" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "snapshotHash" TEXT,
    "metadata" JSONB,

    CONSTRAINT "CrawlRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawSnapshot" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "crawlRunId" TEXT,
    "contentType" TEXT,
    "bodyHash" TEXT NOT NULL,
    "storagePath" TEXT,
    "byteLength" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "RawSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sourceLocationId" TEXT,
    "type" "LocationType" NOT NULL DEFAULT 'dining_hall',
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "sourceUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "sourceVendorId" TEXT,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "sourceUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceWindow" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "vendorId" TEXT,
    "crawlRunId" TEXT,
    "date" DATE NOT NULL,
    "meal" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'planned',
    "sourceUrl" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "confidence" "Confidence" NOT NULL DEFAULT 'medium',
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "serviceWindowId" TEXT,
    "crawlRunId" TEXT,
    "providerKind" "ProviderKind" NOT NULL,
    "date" DATE NOT NULL,
    "meal" TEXT NOT NULL DEFAULT 'all',
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "freshnessMinutes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuPeriod" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "sourcePeriodId" TEXT,
    "name" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sourceStationId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "periodId" TEXT,
    "stationId" TEXT,
    "vendorId" TEXT,
    "sourceItemId" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "description" TEXT,
    "category" TEXT,
    "cuisine" TEXT,
    "servingSizeText" TEXT,
    "portionText" TEXT,
    "priceAmount" DECIMAL(10,2),
    "priceCurrency" TEXT,
    "priceDisplayText" TEXT,
    "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'unknown',
    "availabilityStartTime" TEXT,
    "availabilityEndTime" TEXT,
    "availabilitySourceText" TEXT,
    "dietaryTags" "DietaryTag"[] DEFAULT ARRAY[]::"DietaryTag"[],
    "ingredientStatement" TEXT,
    "nutritionSource" "FactSourceKind" NOT NULL DEFAULT 'unavailable',
    "ingredientSource" "FactSourceKind" NOT NULL DEFAULT 'unavailable',
    "allergenSource" "FactSourceKind" NOT NULL DEFAULT 'unavailable',
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "estimateLabel" TEXT,
    "disclaimer" TEXT,
    "imageUrl" TEXT,
    "itemUrl" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "confidence" "Confidence" NOT NULL DEFAULT 'high',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionFact" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "key" "NutritionKey" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "unit" "NutritionUnit",
    "dailyValuePercent" DOUBLE PRECISION,
    "sourceText" TEXT,
    "sourceKind" "FactSourceKind" NOT NULL DEFAULT 'official',
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "estimatedByModel" TEXT,
    "confidence" "Confidence" NOT NULL DEFAULT 'high',

    CONSTRAINT "NutritionFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientFact" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "containsAllergenKeys" "AllergenKey"[] DEFAULT ARRAY[]::"AllergenKey"[],
    "sourceText" TEXT,
    "sourceKind" "FactSourceKind" NOT NULL DEFAULT 'official',
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "estimatedByModel" TEXT,
    "confidence" "Confidence" NOT NULL DEFAULT 'high',

    CONSTRAINT "IngredientFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllergenFact" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "key" "AllergenKey" NOT NULL,
    "label" TEXT NOT NULL,
    "status" "AllergenStatus" NOT NULL,
    "sourceText" TEXT,
    "sourceKind" "FactSourceKind" NOT NULL DEFAULT 'official',
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "estimatedByModel" TEXT,
    "confidence" "Confidence" NOT NULL DEFAULT 'high',

    CONSTRAINT "AllergenFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateRun" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "EstimateStatus" NOT NULL,
    "inputText" TEXT NOT NULL,
    "output" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EstimateRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "School_rank_idx" ON "School"("rank");

-- CreateIndex
CREATE INDEX "School_providerKind_idx" ON "School"("providerKind");

-- CreateIndex
CREATE INDEX "School_integrationStatus_idx" ON "School"("integrationStatus");

-- CreateIndex
CREATE INDEX "DataSource_schoolId_idx" ON "DataSource"("schoolId");

-- CreateIndex
CREATE INDEX "DataSource_kind_idx" ON "DataSource"("kind");

-- CreateIndex
CREATE INDEX "DataSource_providerKind_idx" ON "DataSource"("providerKind");

-- CreateIndex
CREATE INDEX "CrawlRun_schoolId_idx" ON "CrawlRun"("schoolId");

-- CreateIndex
CREATE INDEX "CrawlRun_dataSourceId_idx" ON "CrawlRun"("dataSourceId");

-- CreateIndex
CREATE INDEX "CrawlRun_status_idx" ON "CrawlRun"("status");

-- CreateIndex
CREATE INDEX "CrawlRun_requestedDate_idx" ON "CrawlRun"("requestedDate");

-- CreateIndex
CREATE INDEX "RawSnapshot_dataSourceId_idx" ON "RawSnapshot"("dataSourceId");

-- CreateIndex
CREATE INDEX "RawSnapshot_crawlRunId_idx" ON "RawSnapshot"("crawlRunId");

-- CreateIndex
CREATE INDEX "RawSnapshot_bodyHash_idx" ON "RawSnapshot"("bodyHash");

-- CreateIndex
CREATE INDEX "Location_schoolId_idx" ON "Location"("schoolId");

-- CreateIndex
CREATE INDEX "Location_type_idx" ON "Location"("type");

-- CreateIndex
CREATE INDEX "Location_sourceLocationId_idx" ON "Location"("sourceLocationId");

-- CreateIndex
CREATE INDEX "Vendor_schoolId_idx" ON "Vendor"("schoolId");

-- CreateIndex
CREATE INDEX "Vendor_sourceVendorId_idx" ON "Vendor"("sourceVendorId");

-- CreateIndex
CREATE INDEX "ServiceWindow_schoolId_idx" ON "ServiceWindow"("schoolId");

-- CreateIndex
CREATE INDEX "ServiceWindow_locationId_idx" ON "ServiceWindow"("locationId");

-- CreateIndex
CREATE INDEX "ServiceWindow_vendorId_idx" ON "ServiceWindow"("vendorId");

-- CreateIndex
CREATE INDEX "ServiceWindow_date_idx" ON "ServiceWindow"("date");

-- CreateIndex
CREATE INDEX "Menu_schoolId_idx" ON "Menu"("schoolId");

-- CreateIndex
CREATE INDEX "Menu_locationId_idx" ON "Menu"("locationId");

-- CreateIndex
CREATE INDEX "Menu_date_idx" ON "Menu"("date");

-- CreateIndex
CREATE INDEX "Menu_providerKind_idx" ON "Menu"("providerKind");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_schoolId_locationId_date_meal_key" ON "Menu"("schoolId", "locationId", "date", "meal");

-- CreateIndex
CREATE INDEX "MenuPeriod_menuId_idx" ON "MenuPeriod"("menuId");

-- CreateIndex
CREATE INDEX "Station_menuId_idx" ON "Station"("menuId");

-- CreateIndex
CREATE INDEX "Station_periodId_idx" ON "Station"("periodId");

-- CreateIndex
CREATE INDEX "MenuItem_schoolId_idx" ON "MenuItem"("schoolId");

-- CreateIndex
CREATE INDEX "MenuItem_menuId_idx" ON "MenuItem"("menuId");

-- CreateIndex
CREATE INDEX "MenuItem_periodId_idx" ON "MenuItem"("periodId");

-- CreateIndex
CREATE INDEX "MenuItem_stationId_idx" ON "MenuItem"("stationId");

-- CreateIndex
CREATE INDEX "MenuItem_vendorId_idx" ON "MenuItem"("vendorId");

-- CreateIndex
CREATE INDEX "MenuItem_sourceItemId_idx" ON "MenuItem"("sourceItemId");

-- CreateIndex
CREATE INDEX "MenuItem_name_idx" ON "MenuItem"("name");

-- CreateIndex
CREATE INDEX "NutritionFact_menuItemId_idx" ON "NutritionFact"("menuItemId");

-- CreateIndex
CREATE INDEX "NutritionFact_key_idx" ON "NutritionFact"("key");

-- CreateIndex
CREATE INDEX "NutritionFact_sourceKind_idx" ON "NutritionFact"("sourceKind");

-- CreateIndex
CREATE INDEX "IngredientFact_menuItemId_idx" ON "IngredientFact"("menuItemId");

-- CreateIndex
CREATE INDEX "IngredientFact_name_idx" ON "IngredientFact"("name");

-- CreateIndex
CREATE INDEX "IngredientFact_sourceKind_idx" ON "IngredientFact"("sourceKind");

-- CreateIndex
CREATE INDEX "AllergenFact_menuItemId_idx" ON "AllergenFact"("menuItemId");

-- CreateIndex
CREATE INDEX "AllergenFact_key_idx" ON "AllergenFact"("key");

-- CreateIndex
CREATE INDEX "AllergenFact_status_idx" ON "AllergenFact"("status");

-- CreateIndex
CREATE INDEX "AllergenFact_sourceKind_idx" ON "AllergenFact"("sourceKind");

-- CreateIndex
CREATE INDEX "EstimateRun_menuItemId_idx" ON "EstimateRun"("menuItemId");

-- CreateIndex
CREATE INDEX "EstimateRun_model_idx" ON "EstimateRun"("model");

-- CreateIndex
CREATE INDEX "EstimateRun_status_idx" ON "EstimateRun"("status");

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlRun" ADD CONSTRAINT "CrawlRun_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlRun" ADD CONSTRAINT "CrawlRun_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawSnapshot" ADD CONSTRAINT "RawSnapshot_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawSnapshot" ADD CONSTRAINT "RawSnapshot_crawlRunId_fkey" FOREIGN KEY ("crawlRunId") REFERENCES "CrawlRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceWindow" ADD CONSTRAINT "ServiceWindow_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceWindow" ADD CONSTRAINT "ServiceWindow_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceWindow" ADD CONSTRAINT "ServiceWindow_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceWindow" ADD CONSTRAINT "ServiceWindow_crawlRunId_fkey" FOREIGN KEY ("crawlRunId") REFERENCES "CrawlRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_serviceWindowId_fkey" FOREIGN KEY ("serviceWindowId") REFERENCES "ServiceWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_crawlRunId_fkey" FOREIGN KEY ("crawlRunId") REFERENCES "CrawlRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuPeriod" ADD CONSTRAINT "MenuPeriod_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MenuPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MenuPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionFact" ADD CONSTRAINT "NutritionFact_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientFact" ADD CONSTRAINT "IngredientFact_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllergenFact" ADD CONSTRAINT "AllergenFact_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateRun" ADD CONSTRAINT "EstimateRun_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
