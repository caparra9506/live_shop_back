// shipment.dto.ts
export class CreateShipmentDto {
  userTikTokId: string;
  productId?: string;  // Opcional para modo producto individual
  cartId?: string;     // Opcional para modo carrito
  storeName: string;
}
  