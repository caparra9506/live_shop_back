export interface TrackingApiResponse {
  origen: string;
  destino: string;
  estados: {
    [key: string]: {
      nombre: string;
      fecha_creacion: string;
      fecha_reparto: string;
      fecha_entrega: string;
      fecha_facturacion: string;
    };
  };
  direccion_destino: string;
}

export interface TrackingRequest {
  guia: string;
  transportadora: {
    pais: string;
    nombre: string;
  };
  origenCreacion: number;
}

export interface TrackingUpdateResult {
  success: boolean;
  message: string;
  guia: string;
  status?: string;
  carrier?: string;
  updatedAt: Date;
}