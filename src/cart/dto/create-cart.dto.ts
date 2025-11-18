export class CreateCartDto {
  userTikTokId: number;
  storeName: string;
  timeoutDays?: number; // Opcional, por defecto 2 días
  notes?: string;
}