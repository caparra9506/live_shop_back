# 📝 Documentación: Variantes de Productos

## 🎯 **Regla Principal**
- **EL STOCK ESTÁ EN EL PRODUCTO PRINCIPAL, NO EN LAS VARIANTES**
- Las variantes son solo combinaciones de color + talla
- Una sola cantidad de stock para todo el producto

## 🏗️ **Estructura Correcta**

### Product (producto principal)
- `stock: number` ← **AQUÍ ESTÁ EL STOCK TOTAL**
- `name, price, description, etc.`

### ProductVariant (variantes)
- `color: Color`
- `size: Size`
- **NO tiene campo stock**

### Color
- `name: string`
- `hexCode: string`

### Size
- `name: string`

## 🔄 **Flujo Correcto**

### 1. Creación de Producto
```json
{
  "name": "Reloj Apple Watch",
  "stock": 50,  // ← Stock total del producto
  "colors": [
    {"name": "Negro", "hexCode": "#000000"},
    {"name": "Blanco", "hexCode": "#FFFFFF"}
  ],
  "sizes": [
    {"name": "38mm"},
    {"name": "42mm"}
  ]
}
```

### 2. Variantes Generadas
Se crean 4 variantes automáticamente:
- Negro + 38mm
- Negro + 42mm  
- Blanco + 38mm
- Blanco + 42mm

**Todas comparten el mismo stock de 50 unidades**

### 3. En el Frontend
- Usuario selecciona: "Negro + 42mm"
- Se reduce stock del producto principal
- No se reduce stock de la variante (porque no tiene)

## ❌ **LO QUE NO SE DEBE HACER**
- ~~Agregar campo `stock` a ProductVariant~~
- ~~Dividir stock entre variantes~~
- ~~Manejar stock individual por color/talla~~

## ✅ **LO QUE SÍ SE DEBE HACER**
- Stock único en Product
- Variantes solo para selección de color/talla
- Reducir stock del producto al vender cualquier variante

---

## 💳 **Split Payment Configuration**

### Nueva Variable de Control
- **ENABLE_SPLIT_PAYMENT=false** ← Controla si usar split payment o no
- Si `false`: Pagos normales sin comisión a la plataforma
- Si `true`: Activa split payment con las reglas configuradas

### Variables Relacionadas
```env
ENABLE_SPLIT_PAYMENT=false           # Activar/desactivar split
PLATFORM_COMMISSION_AMOUNT=1000     # Comisión plataforma (COP)
SPLIT_MINIMUM_AMOUNT=1000           # Monto mínimo para split
EPAYCO_PLATFORM_ID=1553366          # ID de la plataforma
EPAYCO_MERCHANT_ID=877999           # ID del comercio
EPAYCO_SPLIT_RULE_CODE=1            # Código de regla ePayco
```

### Uso
- **Desarrollo/Testing**: `ENABLE_SPLIT_PAYMENT=false`
- **Producción**: `ENABLE_SPLIT_PAYMENT=true` (cuando esté configurado correctamente en ePayco)

---
*Importante: Siempre consultar esta documentación antes de modificar el sistema de variantes o split payment*