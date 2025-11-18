export class AddItemToCartDto {
  cartId: number;
  productId: number;
  quantity: number;
  productVariantId?: number;
}