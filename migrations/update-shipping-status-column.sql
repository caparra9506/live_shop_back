-- Migration: Update shipping status column to support longer 99 Envíos status names
-- Date: 2025-01-10
-- Description: Change status column from enum to VARCHAR(50) to support longer status names

-- Step 1: Add a new temporary column with VARCHAR type
ALTER TABLE shipping ADD COLUMN status_temp VARCHAR(50) DEFAULT 'GUÍA ADMITIDA';

-- Step 2: Copy data from old enum column to new VARCHAR column
UPDATE shipping SET status_temp = status;

-- Step 3: Drop the old enum column
ALTER TABLE shipping DROP COLUMN status;

-- Step 4: Rename the temporary column to status
ALTER TABLE shipping CHANGE COLUMN status_temp status VARCHAR(50) NOT NULL DEFAULT 'GUÍA ADMITIDA';

-- Step 5: Create index on status for better query performance
CREATE INDEX idx_shipping_status ON shipping(status);

-- Verify the change (this is just a comment for reference)
-- DESCRIBE shipping;