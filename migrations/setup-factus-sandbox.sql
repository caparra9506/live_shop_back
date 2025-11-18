-- ============================================
-- CONFIGURACIÓN SANDBOX FACTUS
-- ============================================
-- Script para habilitar facturación electrónica en una tienda existente
-- Usar SOLO para testing con el ambiente sandbox de FACTUS

-- Actualizar configuración de la primera tienda (ajustar store_id según corresponda)
UPDATE store_config 
SET 
    enableElectronicBilling = true,
    factusClientId = '9e4ec14c-81fd-4b7d-86e7-ae9fdce3871e',
    factusClientSecret = 'wPc5Fjv8iFmzgIguJVsi6MNt03xiX6zlXcFbFUKz',
    factusUsername = 'sandbox@factus.com.co',
    factusPassword = 'sandbox2024%',
    factusApiUrl = 'https://api-sandbox.factus.com.co',
    factusTestMode = true,
    factusNumberingRangeId = NULL  -- Se obtendrá automáticamente del primer rango disponible
WHERE store_id = 1;  -- Cambiar por el ID de la tienda que quieras configurar

-- ============================================
-- VERIFICAR CONFIGURACIÓN
-- ============================================
-- Consultar configuración aplicada
SELECT 
    sc.id,
    s.name as store_name,
    sc.enableElectronicBilling,
    sc.factusTestMode,
    sc.factusApiUrl,
    CASE 
        WHEN sc.factusClientId IS NOT NULL THEN 'Configurado' 
        ELSE 'No configurado' 
    END as credentials_status
FROM store_config sc
JOIN stores s ON s.id = sc.store_id
WHERE sc.enableElectronicBilling = true;

-- ============================================
-- INSTRUCCIONES DE USO:
-- ============================================

/*
1. Ejecutar este script para habilitar facturación electrónica en una tienda
2. Realizar una venta de prueba en esa tienda
3. Confirmar el pago (puede ser simulado)
4. El webhook automáticamente generará la factura electrónica
5. Verificar en la tabla electronic_invoices que se creó el registro

IMPORTANTE:
- Estas son credenciales de SANDBOX, solo para testing
- En producción usar credenciales reales de FACTUS
- El factusNumberingRangeId se puede dejar NULL inicialmente
*/