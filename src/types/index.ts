// Roles
export type UserRole = 'admin' | 'ambulancia';

export interface AppUser {
  uid: string;
  email: string | null;
  role: UserRole;
  displayName?: string;
}

// Estado de la emergencia
export type EmergencyStatus =
  | 'pendiente'
  | 'en_camino'
  | 'en_sitio'
  | 'finalizada';

// Tipos de servicio
export type ServiceType =
  | 'evento'
  | 'traslado'
  | 'emergencia'
  | 'membresia';

// Información general del paciente / cliente
export interface PatientInfo {
  nombre: string;
  edad?: number;
  telefono?: string;
  genero?: string;
  identificacion?: string;
  notas?: string; // cualquier info adicional
}

// Tiempos de cambio de estado
export interface EmergencyStatusTimestamps {
  pendiente: number;      // cuando se creó / quedó pendiente
  en_camino?: number;     // cuando se cambió a "en_camino"
  en_sitio?: number;      // cuando se cambió a "en_sitio"
  finalizada?: number;    // cuando se cambió a "finalizada"
}

// Emergencia / Servicio
export interface Emergency {
  id: string;
  folio: string;
  tipoServicio: ServiceType;
  descripcion: string;
  paciente: PatientInfo;

  direccion: string;
  lat: number;
  lng: number;

  ambulanciaId: string;
  estado: EmergencyStatus;

  createdAt: number;
  statusTimestamps: EmergencyStatusTimestamps;

  // 👇 nuevo
  ambulanciaDescripcion?: string;  // texto que llenará la ambulancia
}