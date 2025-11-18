# Configuración de Webhooks de Carrito en N8N

Este documento describe cómo configurar los webhooks de N8N para recibir y procesar notificaciones del sistema de carrito (baúl).

## URLs de Webhook Requeridas

Necesitas crear dos webhooks en N8N:

1. **WEBHOOK_CART_ITEM_ADDED_URL** - Para notificaciones cuando se agrega un producto al carrito
2. **WEBHOOK_CART_EXPIRED_URL** - Para notificaciones cuando un carrito expira

## Configuración en N8N

### 1. Webhook: Producto Agregado al Carrito

**Nombre del workflow:** `Cart Item Added Notification`

#### Paso 1: Crear Webhook Node

1. Crear nuevo workflow en N8N
2. Agregar nodo **Webhook**
3. Configurar:
   - **Path:** `cart-item-added` (o el que prefieras)
   - **Method:** POST
   - **Response Mode:** Immediately
   - **Response Code:** 200

4. La URL generada será algo como:
   ```
   https://n8n-n8n.shblkb.easypanel.host/webhook/cart-item-added
   ```

5. **Copiar esta URL y agregarla al .env del backend:**
   ```env
   WEBHOOK_CART_ITEM_ADDED_URL=https://n8n-n8n.shblkb.easypanel.host/webhook/cart-item-added
   ```

#### Paso 2: Procesar Datos

El payload que recibirá el webhook:

```json
{
  "cartId": 123,
  "userTikTokId": 456,
  "userName": "Juan Pérez",
  "userPhone": "3001234567",
  "storeName": "bodegacompraloocolombiaa",
  "product": {
    "id": 8,
    "name": "Camiseta Negra",
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

#### Paso 3: Formatear Mensaje

Agregar nodo **Function** o **Set** para formatear el mensaje:

```javascript
// Ejemplo de formateo de mensaje
const product = $json.product;
const shipping = $json.shippingCost === 0 ? 'GRATIS (sin costo de envío)' : `$${$json.shippingCost} COP`;

return {
  to: $json.userPhone,
  message: `¡Producto agregado al baúl! 🛒

Producto: ${product.name}
Precio: $${product.price} COP
Cantidad: ${$json.quantity}

Total producto: $${$json.totalAmount} COP
Envío: ${shipping}

⏰ Tiempo límite: ${$json.timeoutDays} días

También puedes pagar manualmente cuando gustes en:
${$json.checkoutUrl}

¡Gracias por tu compra! 😊`
};
```

#### Paso 4: Enviar WhatsApp

Agregar nodo para enviar WhatsApp (UltraMsg, Twilio, o el que uses):

**Ejemplo con HTTP Request (UltraMsg):**

```
Method: POST
URL: https://api.ultramsg.com/{instance_id}/messages/chat
Headers:
  Content-Type: application/json
Body:
{
  "token": "tu_token_ultramsg",
  "to": "{{$node["Function"].json["to"]}}",
  "body": "{{$node["Function"].json["message"]}}"
}
```

---

### 2. Webhook: Carrito Expirado

**Nombre del workflow:** `Cart Expired Notification`

#### Paso 1: Crear Webhook Node

1. Crear nuevo workflow en N8N
2. Agregar nodo **Webhook**
3. Configurar:
   - **Path:** `cart-expired` (o el que prefieras)
   - **Method:** POST
   - **Response Mode:** Immediately
   - **Response Code:** 200

4. La URL generada será algo como:
   ```
   https://n8n-n8n.shblkb.easypanel.host/webhook/cart-expired
   ```

5. **Copiar esta URL y agregarla al .env del backend:**
   ```env
   WEBHOOK_CART_EXPIRED_URL=https://n8n-n8n.shblkb.easypanel.host/webhook/cart-expired
   ```

#### Paso 2: Procesar Datos

El payload que recibirá el webhook:

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
  "paymentLink": "https://comprepues.com.co/cart/expired?cart=123&token=abc123...",
  "expiresAt": "2025-11-20T18:00:00.000Z",
  "createdAt": "2025-11-18T18:00:00.000Z",
  "timestamp": "2025-11-20T18:05:00.000Z"
}
```

#### Paso 3: Formatear Mensaje

Agregar nodo **Function** o **Set** para formatear el mensaje:

```javascript
// Ejemplo de formateo de mensaje de expiración
const shipping = $json.shippingCost === 0 ? 'GRATIS' : `$${$json.shippingCost} COP`;
const items = $json.itemsCount === 1 ? '1 producto' : `${$json.itemsCount} productos`;

return {
  to: $json.userPhone,
  message: `⏰ Tu baúl ha expirado

Tienes ${items} esperando ser pagados.

Total: $${$json.totalAmount} COP
Envío: ${shipping}

🔗 Para completar tu compra, usa este enlace:
${$json.paymentLink}

(El enlace es válido por 7 días)

¡No pierdas esta oportunidad! 🛍️`
};
```

#### Paso 4: Enviar WhatsApp

Agregar nodo para enviar WhatsApp (igual que en el flujo anterior).

---

## Configuración Completa del Backend

Una vez creados los webhooks en N8N, actualizar el archivo `.env` del backend:

```env
# Cart Webhooks
WEBHOOK_CART_ITEM_ADDED_URL=https://n8n-n8n.shblkb.easypanel.host/webhook/cart-item-added
WEBHOOK_CART_EXPIRED_URL=https://n8n-n8n.shblkb.easypanel.host/webhook/cart-expired

# RabbitMQ Queues (ya configuradas automáticamente)
RABBITMQ_CART_ITEM_ADDED_QUEUE_NAME=cart_item_added_queue
RABBITMQ_CART_EXPIRED_QUEUE_NAME=cart_expired_queue
```

**Reiniciar el backend** para que tome las nuevas configuraciones.

---

## Sistema de Colas RabbitMQ

Las notificaciones pasan primero por RabbitMQ antes de llegar a N8N, lo que garantiza:

✅ **Persistencia**: Los mensajes no se pierden si N8N está caído
✅ **Reintentos Automáticos**: 3 intentos con delay exponencial (2s, 4s, 8s)
✅ **Monitoreo**: Logs detallados de cada mensaje procesado
✅ **Orden Garantizado**: Los mensajes se procesan en orden FIFO

### Colas Creadas Automáticamente

1. **cart_item_added_queue**
   - Procesa notificaciones de items agregados
   - Envía a `WEBHOOK_CART_ITEM_ADDED_URL`

2. **cart_expired_queue**
   - Procesa notificaciones de carritos expirados
   - Envía a `WEBHOOK_CART_EXPIRED_URL`
   - Prioridad alta (priority: 2)

---

## Verificación

### 1. Verificar que las colas se crearon correctamente

Revisar logs del backend al iniciar:

```
✅ Cola 'cart_item_added_queue' configurada correctamente
✅ Cola 'cart_expired_queue' configurada correctamente
🔄 Consumer de items agregados al carrito iniciado - escuchando...
🔄 Consumer de carritos expirados iniciado - escuchando...
```

### 2. Probar notificación de item agregado

**Endpoint de prueba:**
```bash
POST /api/cart/{cartId}/items
{
  "productId": 8,
  "quantity": 1
}
```

**Logs esperados:**
```
📥 ENCOLANDO NOTIFICACIÓN DE ITEM AGREGADO AL CARRITO
✅ Notificación de item agregado encolada exitosamente: Cart 123 - Producto X
📥 NOTIFICACIÓN DE ITEM AGREGADO DESENCOLADA
📤 ENVIANDO NOTIFICACIÓN DE ITEM AGREGADO A N8N
✅ Notificación de item agregado enviada exitosamente a N8N
📦 Notificación de item agregado encolada para Cart 123
```

### 3. Probar notificación de carrito expirado

**Esperar a que el scheduler procese carritos expirados (cada 5 minutos), o:**

**Endpoint manual (si existe):**
```bash
POST /api/cart/scheduler/process/{cartId}
```

**Logs esperados:**
```
🌐 Encolando notificación de carrito expirado 123 para enviar link de pago
✅ Notificación de carrito expirado encolada para carrito 123
📥 NOTIFICACIÓN DE CARRITO EXPIRADO DESENCOLADA
📤 ENVIANDO NOTIFICACIÓN DE CARRITO EXPIRADO A N8N
✅ Notificación de carrito expirado enviada exitosamente a N8N
```

---

## Troubleshooting

### Las notificaciones no llegan a N8N

1. **Verificar que las URLs estén configuradas:**
   ```bash
   echo $WEBHOOK_CART_ITEM_ADDED_URL
   echo $WEBHOOK_CART_EXPIRED_URL
   ```

2. **Verificar logs de RabbitMQ:**
   ```
   # Buscar en logs del backend
   grep "ENCOLANDO NOTIFICACIÓN" logs.txt
   grep "Error enviando" logs.txt
   ```

3. **Verificar que N8N esté accesible:**
   ```bash
   curl -X POST https://n8n-n8n.shblkb.easypanel.host/webhook/cart-item-added \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

### Los mensajes se quedan en la cola

- Verificar que los consumers estén iniciados (ver logs al iniciar el backend)
- Verificar conectividad con RabbitMQ
- Revisar estado de las colas en RabbitMQ Management Console

### Las notificaciones se reenvían múltiples veces

- Normal: El sistema reintenta hasta 3 veces si falla
- Si ves más de 3 reintentos, verificar la configuración de `maxRetries`

---

## Notas Importantes

1. **URLs Opcionales**: Si no configuras las URLs, el sistema seguirá funcionando pero sin enviar notificaciones
2. **Seguridad**: Las URLs de webhook deberían estar protegidas en producción
3. **Testing**: Puedes usar ngrok o similar para probar localmente
4. **Monitoreo**: Revisar regularmente los logs para detectar fallos en el envío
5. **Escalabilidad**: RabbitMQ puede manejar miles de notificaciones simultáneas

---

**Última actualización:** 2025-11-18
**Versión:** 1.0
