# Sistema de Notificaciones de Carrito (Baúl)

Este documento describe el sistema de notificaciones para el carrito de compras (baúl) y cómo el frontend debe manejarlo.

## Descripción General

El sistema envía notificaciones automáticas a los usuarios cuando:
1. **Agregan un producto al carrito**: Notificación inmediata con información del producto y enlace al checkout
2. **El carrito expira**: Notificación con link de pago después de 2 días (configurable)

## Flujo de Notificaciones

### 1. Notificación de Producto Agregado

**Cuándo se envía:**
- Inmediatamente cuando el usuario agrega un producto al carrito

**Payload que recibe N8N (`WEBHOOK_CART_ITEM_ADDED_URL`):**
```json
{
  "cartId": 123,
  "userTikTokId": 456,
  "userName": "Juan Pérez",
  "userPhone": "3001234567",
  "storeName": "bodegacompraloocolombiaa",
  "product": {
    "id": 8,
    "name": "Producto X",
    "price": 15000,
    "imageUrl": "https://..."
  },
  "quantity": 1,
  "totalAmount": 15000,
  "shippingCost": 0,
  "expiresAt": "2025-11-20T18:00:00.000Z",
  "timeoutDays": 2,
  "checkoutUrl": "https://comprepues.com.co/tiktok/bodegacompraloocolombiaa/checkout?userTikTokId=456",
  "timestamp": "2025-11-18T18:00:00.000Z"
}
```

**Mensaje sugerido a enviar al usuario:**
```
¡Producto agregado al baúl!

Producto: {product.name}
Precio: ${product.price} COP
Cantidad: {quantity}
Total: ${totalAmount} COP
Envío: {shippingCost === 0 ? 'GRATIS' : `$${shippingCost} COP`}

Tiempo límite: {timeoutDays} días

Puedes gestionar tu baúl y pagar cuando gustes:
{checkoutUrl}
```

### 2. Notificación de Carrito Expirado

**Cuándo se envía:**
- Cuando el carrito cumple 2 días (tiempo configurable) sin ser pagado
- Se ejecuta automáticamente cada 5 minutos por el scheduler

**Payload que recibe N8N (`WEBHOOK_CART_EXPIRED_URL`):**
```json
{
  "cartId": 123,
  "userTikTokId": 456,
  "userName": "Juan Pérez",
  "userPhone": "3001234567",
  "userEmail": "juan@example.com",
  "storeName": "bodegacompraloocolombiaa",
  "totalAmount": 15000,
  "shippingCost": 0,
  "itemsCount": 1,
  "paymentLink": "https://comprepues.com.co/cart/expired?cart=123&token=...",
  "expiresAt": "2025-11-20T18:00:00.000Z",
  "createdAt": "2025-11-18T18:00:00.000Z",
  "timestamp": "2025-11-20T18:05:00.000Z"
}
```

**Mensaje sugerido a enviar al usuario:**
```
⏰ Tu baúl ha expirado

Tienes {itemsCount} producto(s) esperando ser pagados
Total: ${totalAmount} COP
Envío: {shippingCost === 0 ? 'GRATIS' : `$${shippingCost} COP`}

Para completar tu compra, usa este enlace:
{paymentLink}

(El enlace es válido por 7 días)
```

## Requerimientos del Frontend

### 1. Página de Checkout con Carrito Activo

**URL:** `https://comprepues.com.co/tiktok/{storeName}/checkout?userTikTokId={id}`

**Funcionalidad requerida:**
- Buscar el carrito activo del usuario por `userTikTokId` y `storeName`
- Mostrar todos los productos en el carrito
- Permitir modificar cantidades
- Mostrar tiempo restante antes de expiración
- Botón para proceder al pago
- Opción para eliminar productos del carrito

**Endpoint del backend para obtener carrito:**
```
GET /api/cart/user/{userTikTokId}/store/{storeName}
```

**Respuesta:**
```json
{
  "id": 123,
  "status": "ACTIVE",
  "totalAmount": 15000,
  "shippingCost": 0,
  "discountAmount": 0,
  "expiresAt": "2025-11-20T18:00:00.000Z",
  "timeoutDays": 2,
  "cartItems": [
    {
      "id": 1,
      "product": {
        "id": 8,
        "name": "Producto X",
        "imageUrl": "...",
        "price": 15000
      },
      "quantity": 1,
      "price": 15000,
      "subtotal": 15000
    }
  ],
  "tiktokUser": {
    "id": 456,
    "name": "Juan Pérez",
    "phone": "3001234567"
  },
  "store": {
    "id": 1,
    "name": "bodegacompraloocolombiaa"
  }
}
```

### 2. Página de Carrito Expirado con Token

**URL:** `https://comprepues.com.co/cart/expired?cart={cartId}&token={token}`

**Funcionalidad requerida:**
- Verificar el token de seguridad
- Mostrar productos del carrito expirado
- Botón para proceder al pago
- Mensaje indicando que el carrito ha expirado y el stock ha sido liberado
- Opción para crear un nuevo carrito con los mismos productos (si el stock está disponible)

**Endpoint del backend:**
```
GET /api/cart/expired/{cartId}?token={token}
```

### 3. Contador de Tiempo

Implementar un contador regresivo que muestre el tiempo restante antes de que expire el carrito:

```typescript
// Ejemplo en TypeScript/React
const getTimeRemaining = (expiresAt: string) => {
  const now = new Date().getTime();
  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
    expired: false
  };
};
```

**También puede consultar el endpoint del backend:**
```
GET /api/cart/{cartId}/time-remaining
```

## Estados del Carrito

```typescript
enum CartStatus {
  ACTIVE = 'ACTIVE',       // Carrito activo, puede ser modificado
  EXPIRED = 'EXPIRED',     // Carrito expirado, stock liberado
  COMPLETED = 'COMPLETED', // Compra completada
  CANCELLED = 'CANCELLED'  // Cancelado por el usuario o el sistema
}
```

## Configuración del Sistema

### Variables de Entorno Backend

```env
# URLs de webhooks de N8N (dejar vacío si no se requiere notificación)
WEBHOOK_CART_ITEM_ADDED_URL=https://n8n-n8n.shblkb.easypanel.host/webhook/[tu-webhook-id]
WEBHOOK_CART_EXPIRED_URL=https://n8n-n8n.shblkb.easypanel.host/webhook/[tu-webhook-id]

# URLs del frontend
FRONTEND_URL=https://comprepues.com.co

# Colas de RabbitMQ
RABBITMQ_CART_ITEM_ADDED_QUEUE_NAME=cart_item_added_queue
RABBITMQ_CART_EXPIRED_QUEUE_NAME=cart_expired_queue
```

### Configuración de Tienda

Cada tienda puede configurar el tiempo de expiración del carrito:

```typescript
// En la entidad StoreConfig
cartEnabled: boolean;        // Habilitar/deshabilitar sistema de baúl
cartTimeoutDays: number;     // Días antes de expirar (default: 2)
```

## Flujo Completo del Usuario

1. **Usuario agrega producto al carrito**
   - Backend reserva stock
   - Backend crea/actualiza carrito con fecha de expiración
   - Backend envía notificación vía RabbitMQ
   - N8N recibe notificación y envía WhatsApp al usuario con enlace al checkout

2. **Usuario recibe notificación**
   - Mensaje incluye enlace directo: `https://comprepues.com.co/tiktok/{store}/checkout?userTikTokId={id}`

3. **Usuario hace clic en enlace**
   - Frontend carga página de checkout
   - Muestra carrito activo con contador de tiempo
   - Usuario puede:
     - Modificar cantidades
     - Eliminar productos
     - Proceder al pago
     - Ver tiempo restante

4. **Escenario A: Usuario paga antes de expirar**
   - Carrito pasa a estado `COMPLETED`
   - Stock queda definitivamente asignado a la venta

5. **Escenario B: Carrito expira (2 días)**
   - Scheduler detecta expiración
   - Backend libera stock reservado
   - Backend genera link de pago único con token
   - Backend envía notificación vía RabbitMQ
   - N8N recibe y envía WhatsApp con link de pago
   - Usuario puede acceder con token a carrito expirado y decidir si crear nueva orden

## Endpoints del Backend

### Gestión de Carrito

```
POST   /api/cart                          - Crear carrito
POST   /api/cart/{cartId}/items           - Agregar item al carrito
PUT    /api/cart/items/{cartItemId}       - Actualizar cantidad de item
DELETE /api/cart/items/{cartItemId}       - Eliminar item del carrito
GET    /api/cart/{cartId}                 - Obtener carrito por ID
GET    /api/cart/user/{userId}/store/{store} - Obtener carrito activo del usuario
GET    /api/cart/{cartId}/time-remaining  - Obtener tiempo restante
PUT    /api/cart/{cartId}/extend          - Extender tiempo de expiración (admin)
GET    /api/cart/expired/{cartId}?token=  - Obtener carrito expirado con token
```

## Consideraciones Importantes

1. **Reserva de Stock**: Cuando se agrega un producto al carrito, el stock se reserva inmediatamente
2. **Liberación de Stock**: Cuando el carrito expira o se eliminan items, el stock se libera automáticamente
3. **Seguridad**: Los links de carrito expirado incluyen un token de seguridad único
4. **Tiempo de Expiración**: Configurable por tienda, default 2 días
5. **Scheduler**: Se ejecuta cada 5 minutos para procesar carritos expirados
6. **RabbitMQ**: Sistema de colas con retry automático (3 intentos con backoff exponencial)
7. **Notificaciones Opcionales**: Si no se configuran las URLs de webhook, el sistema funciona sin enviar notificaciones

## Ejemplo de Implementación N8N

Para configurar los workflows en N8N, crear dos webhooks:

1. **cart-item-added**: Recibe notificación cuando se agrega producto
   - Extraer datos del payload
   - Formatear mensaje de WhatsApp
   - Enviar a usuario vía WhatsApp/Twilio

2. **cart-expired**: Recibe notificación cuando expira el carrito
   - Extraer link de pago
   - Formatear mensaje con urgencia
   - Enviar a usuario con link de pago

---

**Última actualización:** 2025-11-18
**Versión:** 1.0
