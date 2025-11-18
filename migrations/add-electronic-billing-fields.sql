-- ============================================
-- MIGRACIÓN: Agregar campos de facturación electrónica a store_config
-- ============================================

-- Agregar columnas para facturación electrónica
ALTER TABLE store_config 
ADD COLUMN IF NOT EXISTS enableElectronicBilling BOOLEAN DEFAULT FALSE AFTER feePayer,
ADD COLUMN IF NOT EXISTS factusClientId VARCHAR(255) NULL AFTER enableElectronicBilling,
ADD COLUMN IF NOT EXISTS factusClientSecret VARCHAR(255) NULL AFTER factusClientId,
ADD COLUMN IF NOT EXISTS factusUsername VARCHAR(255) NULL AFTER factusClientSecret,
ADD COLUMN IF NOT EXISTS factusPassword VARCHAR(255) NULL AFTER factusUsername,
ADD COLUMN IF NOT EXISTS factusApiUrl VARCHAR(255) DEFAULT 'https://api-sandbox.factus.com.co' AFTER factusPassword,
ADD COLUMN IF NOT EXISTS factusTestMode BOOLEAN DEFAULT TRUE AFTER factusApiUrl,
ADD COLUMN IF NOT EXISTS factusNumberingRangeId INT NULL AFTER factusTestMode;

-- Verificar que las columnas se agregaron correctamente
DESCRIBE store_config;