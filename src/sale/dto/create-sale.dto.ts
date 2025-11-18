export class CreateSaleDto {
    userTikTokId: number;
    storeName: string;
    products: { productId: number; quantity: number; price: number; productVariantId?: number }[];
    couponCode?: string;
    shippingCost: number;
    transportadora: string;
    bankCode: string; // 👈 agrega esto
  }
  