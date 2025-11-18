-- ============================================
-- MIGRACIÓN: Tabla para Facturación Electrónica
-- ============================================

CREATE TABLE IF NOT EXISTS `electronic_invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `store_id` int NOT NULL,
  `sale_id` int NOT NULL,
  `factus_id` varchar(255) DEFAULT NULL,
  `cufe` varchar(255) DEFAULT NULL,
  `invoice_number` varchar(255) DEFAULT NULL,
  `prefix` varchar(50) DEFAULT NULL,
  `resolution_number` varchar(255) DEFAULT NULL,
  `qr_code` text,
  `pdf_url` text,
  `xml_url` text,
  `status` enum('PENDING','GENERATED','VALIDATED','FAILED') NOT NULL DEFAULT 'PENDING',
  `total_amount` decimal(10,2) NOT NULL,
  `tax_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `subtotal` decimal(10,2) NOT NULL,
  `customer_document_type` varchar(10) NOT NULL,
  `customer_document` varchar(50) NOT NULL,
  `customer_name` varchar(255) NOT NULL,
  `customer_email` varchar(255) NOT NULL,
  `customer_phone` varchar(50) DEFAULT NULL,
  `customer_address` text,
  `customer_city` varchar(255) DEFAULT NULL,
  `factus_response` text,
  `error_message` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_electronic_invoices_sale` (`sale_id`),
  KEY `FK_electronic_invoices_store` (`store_id`),
  KEY `IDX_electronic_invoices_status` (`status`),
  KEY `IDX_electronic_invoices_cufe` (`cufe`),
  KEY `IDX_electronic_invoices_factus_id` (`factus_id`),
  CONSTRAINT `FK_electronic_invoices_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_electronic_invoices_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================
-- COMENTARIOS SOBRE LA TABLA:
-- ============================================
-- factus_id: ID único de la factura en FACTUS
-- cufe: Código Único de Facturación Electrónica
-- invoice_number: Número de factura generado
-- prefix: Prefijo de numeración
-- resolution_number: Número de resolución DIAN
-- qr_code: Código QR para validación
-- pdf_url: URL del PDF de la factura
-- xml_url: URL del XML de la factura
-- status: Estado de la factura (PENDING, GENERATED, VALIDATED, FAILED)
-- factus_response: Respuesta completa de FACTUS (JSON)
-- error_message: Mensaje de error si falla la generación

-- ============================================
-- ÍNDICES PARA OPTIMIZAR CONSULTAS:
-- ============================================
-- - Único por venta (una factura por venta)
-- - Índice por tienda para listar facturas
-- - Índice por estado para filtrar
-- - Índice por CUFE para búsquedas rápidas
-- - Índice por ID de FACTUS para sincronización