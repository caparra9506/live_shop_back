interface Cotizacion {
    mensaje: string;
    valor: number;
    valor_contrapago: number;
    comision_interna?: number;
    valor_interna?: number;
    sobreflete: number;
    dias: string;
    IdServicio: number;
    fecha_entrega: string | null;
    exito: boolean;
  }
  
  interface CotizacionResponse {
    interrapidisimo?: Cotizacion;
    tcc?: Cotizacion;
    servientrega?: Cotizacion;
    coordinadora?: Cotizacion;
  }
  