interface User {
    id: number;
    id_rol: number;
    email: string;
    email_verified_at: string | null;
    terminos_condiciones: number;
    created_at: string;
    updated_at: string;
  }
  
  interface Sucursal {
    codigo_sucursal: number;
    nombre_sucursal: string;
    nivel_padre: number;
    porcentaje_comision: number;
  }
  
  interface LoginResponse {
    user: User;
    token: string;
    sucursales: Sucursal[];
  }
  