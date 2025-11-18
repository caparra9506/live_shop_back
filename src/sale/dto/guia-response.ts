export interface GuiaResponse {
  numeroPreenvio: number;
  fechaVencimiento: string;
  fechaCreacion: string;
  valorFlete: number;
  valorSobreFlete: number;
  valorServicioContraPago: number;
  estadoRecogida: boolean;
  numeroRecogida: number;
  mensaje: string;
}
