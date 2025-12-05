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
  id: string;                // ID del documento en Firestore
  folio: string;             // folio autogenerado
  tipoServicio: ServiceType; // Evento, traslado, etc.
  descripcion: string;       // descripción del servicio
  paciente: PatientInfo;     // información del paciente/cliente

  direccion: string;
  lat: number;
  lng: number;

  ambulanciaId: string;      // UID de la ambulancia asignada
  estado: EmergencyStatus;

  createdAt: number;         // timestamp de creación
  statusTimestamps: EmergencyStatusTimestamps; // horas por estado
}
