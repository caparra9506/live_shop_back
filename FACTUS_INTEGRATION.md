# 📄 Integración FACTUS - Facturación Electrónica

## 🚀 Resumen

Se ha integrado completamente el sistema de facturación electrónica **FACTUS** en el proyecto ComprePues. Esta integración permite:

- ✅ **Generación automática** de facturas electrónicas cuando se confirman pagos
- ✅ **Configuración por tienda** - cada tienda puede habilitar/deshabilitar individualmente
- ✅ **Ambiente Sandbox** configurado y listo para pruebas
- ✅ **Panel de administración** para ver y gestionar facturas
- ✅ **Integración con webhook de ePayco** - automático al confirmar pagos
- ✅ **Manejo robusto de errores** sin afectar el flujo principal de ventas

## 📦 Archivos Creados

### 1. Módulo de Facturación Electrónica
- `src/electronic-billing/electronic-billing.module.ts`
- `src/electronic-billing/electronic-billing.service.ts`
- `src/electronic-billing/electronic-billing.controller.ts`
- `src/electronic-billing/dto/create-electronic-invoice.dto.ts`

### 2. Entidad de Base de Datos
- `src/entity/electronic-invoice.entity.ts`
- `migrations/electronic-invoices.sql`

### 3. Componentes Frontend
- `ElectronicInvoices.tsx` - Visualización de facturas electrónicas
- `ElectronicBillingConfig.tsx` - Configuración de facturación electrónica

### 4. Archivos de Configuración
- `.env.example.factus` - Variables de entorno con credenciales sandbox
- `migrations/setup-factus-sandbox.sql` - Script para habilitar en BD
- `FACTUS_INTEGRATION.md` - Este archivo de documentación

## ⚙️ Configuración Rápida

### 1. Base de Datos

Ejecutar las migraciones:

```bash
# Crear tabla de facturas electrónicas
mysql -u usuario -p database_name < migrations/electronic-invoices.sql

# Habilitar facturación electrónica en una tienda (configurar store_id)
mysql -u usuario -p database_name < migrations/setup-factus-sandbox.sql
```

### 2. Configuración en el Admin Panel

1. Ir al panel de administración
2. Navegar a "Configuración"
3. Scroll hasta "Configuración de Facturación Electrónica"
4. ✅ Marcar "Habilitar Facturación Electrónica"
5. 🚀 Hacer clic en "Cargar configuración Sandbox" (credenciales incluidas)
6. 💾 Guardar configuración
7. 🔌 Probar conexión

**¡Listo!** La facturación electrónica está configurada y funcionará automáticamente.

### 3. Credenciales Sandbox Incluidas

```bash
# Credenciales ya configuradas en el botón "Cargar configuración Sandbox"
URL: https://api-sandbox.factus.com.co
Client ID: 9e4ec14c-81fd-4b7d-86e7-ae9fdce3871e
Client Secret: wPc5Fjv8iFmzgIguJVsi6MNt03xiX6zlXcFbFUKz
Username: sandbox@factus.com.co
Password: sandbox2024%
```

## 🎯 Endpoints Disponibles

### 1. Generar Factura Electrónica Automática

```http
POST /api/sales/generate-electronic-invoice/:saleId?paymentMethod=48
```

Genera automáticamente una factura electrónica basada en los datos de una venta existente.

**Parámetros:**
- `saleId`: ID de la venta
- `paymentMethod`: Código del medio de pago (opcional, default: 48 = Tarjeta Crédito)

### 2. Crear Factura Electrónica Personalizada

```http
POST /api/electronic-billing/invoice
```

Crea una factura electrónica con datos personalizados.

**Body ejemplo:**
```json
{
  "saleId": 123,
  "reference_code": "SALE-123-1234567890",
  "payment_method_code": "48",
  "observation": "Factura de prueba",
  "items": [
    {
      "code_reference": "PROD001",
      "name": "Producto de ejemplo",
      "quantity": 1,
      "price": 100000,
      "tax_rate": 19,
      "discount_rate": 0
    }
  ]
}
```

### 3. Validar Factura

```http
POST /api/electronic-billing/invoice/:invoiceId/validate
```

Valida una factura electrónica ante FACTUS.

### 4. Consultar Facturas

```http
GET /api/electronic-billing/invoice/sale/:saleId
GET /api/electronic-billing/invoice/store/:storeId
```

## 🔄 Flujo de Integración

### 1. Flujo Automático ⭐ (Recomendado)

1. Usuario realiza una compra en TikTok/WhatsApp
2. Se crea la venta en el sistema
3. Se procesa el pago con ePayco
4. **ePayco envía webhook de confirmación**
5. ✅ **AUTOMÁTICO**: Sistema verifica si facturación está habilitada
6. ✅ **AUTOMÁTICO**: Se genera factura electrónica con FACTUS
7. ✅ **AUTOMÁTICO**: Se almacena CUFE, PDF y XML
8. Usuario puede descargar PDF desde el admin panel

### 2. Flujo Manual

1. Administrador accede al panel de ventas
2. Selecciona una venta sin factura electrónica
3. Hace clic en "Generar Factura Electrónica"
4. Sistema llama al endpoint de generación
5. Se procesa y almacena la factura

## 📊 Datos Almacenados

Para cada factura electrónica se almacena:

- **Identificadores**: ID de FACTUS, CUFE, número de factura
- **Archivos**: URLs del PDF y XML
- **Estado**: PENDING, GENERATED, VALIDATED, FAILED
- **Datos fiscales**: Total, impuestos, subtotal
- **Información del cliente**: Documento, nombre, email, etc.
- **Respuesta completa de FACTUS** para auditoría

## 🎨 Códigos de Medios de Pago

| Código | Descripción |
|--------|-------------|
| 10 | Efectivo |
| 20 | Cheque |
| 42 | Consignación |
| 46 | Transferencia Débito |
| 47 | Transferencia |
| 48 | Tarjeta Crédito ⭐ |
| 49 | Tarjeta Débito |

## 🆔 Códigos de Tipos de Documento

| Código | Descripción |
|--------|-------------|
| 1 | Registro civil |
| 2 | Tarjeta de identidad |
| 3 | Cédula ciudadanía ⭐ |
| 4 | Tarjeta de extranjería |
| 5 | Cédula de extranjería |
| 6 | NIT |
| 7 | Pasaporte |

## 🛠️ Configuración Avanzada

### Personalizar Items de Factura

En `electronic-billing.service.ts`, método `generateInvoiceFromSale()`:

```typescript
const items = sale.saleDetails.map((detail, index) => ({
  code_reference: detail.product.id.toString(),
  name: detail.product.name,
  quantity: detail.quantity,
  price: parseFloat(detail.price.toString()),
  tax_rate: 19, // 🔧 Configurable según producto
  unit_measure_id: 70, // 🔧 Unidad por defecto
  standard_code_id: 1, // 🔧 Estándar de adopción
  is_excluded: 0, // 🔧 ¿Excluido de IVA?
  tribute_id: 1, // 🔧 Tipo de tributo
}));
```

### Manejo de Errores

El sistema maneja automáticamente:
- Errores de conectividad con FACTUS
- Credenciales inválidas
- Facturas duplicadas
- Datos de venta incompletos

Los errores se registran en logs y no afectan el flujo principal de ventas.

## 🔧 Resolución de Problemas

### Error: "Token inválido"
- Verificar credenciales en `.env`
- Revisar que FACTUS_API_URL sea correcta

### Error: "Venta no encontrada"
- Verificar que el `saleId` exista
- Confirmar relaciones de base de datos

### Error: "Ya existe factura para esta venta"
- Cada venta solo puede tener una factura electrónica
- Revisar tabla `electronic_invoices`

## 🎯 Cómo Probar

### 1. Configurar una tienda (una sola vez)
```sql
-- Ejecutar en BD para habilitar en tienda ID 1
UPDATE store_config 
SET enableElectronicBilling = true,
    factusClientId = '9e4ec14c-81fd-4b7d-86e7-ae9fdce3871e',
    factusClientSecret = 'wPc5Fjv8iFmzgIguJVsi6MNt03xiX6zlXcFbFUKz',
    factusUsername = 'sandbox@factus.com.co',
    factusPassword = 'sandbox2024%',
    factusApiUrl = 'https://api-sandbox.factus.com.co',
    factusTestMode = true
WHERE store_id = 1;
```

### 2. Realizar una venta de prueba
1. Crear una venta desde TikTok/WhatsApp
2. Procesar pago (puede ser simulado)
3. ✅ El webhook automáticamente generará la factura

### 3. Verificar resultado
1. Ir al admin panel → "Facturas Electrónicas"
2. Ver la factura generada con CUFE
3. Descargar PDF y XML

## 🎉 ¡Todo Listo!

✅ **Facturación electrónica 100% funcional y automática**
- Configuración por tienda ✅
- Ambiente sandbox configurado ✅  
- Generación automática en webhook ✅
- Panel de administración ✅
- Manejo robusto de errores ✅

**La integración está lista para producción.** Solo cambiar credenciales sandbox por las reales de FACTUS cuando sea necesario.