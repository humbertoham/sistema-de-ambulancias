export type UserRole = 'admin' | 'ambulancia';

export interface AppUser {
  uid: string;
  email: string | null;
  role: UserRole;
  displayName?: string;
}

export type EmergencyStatus = 'pendiente' | 'en_camino' | 'en_sitio' | 'finalizada';

export interface Emergency {
  id: string;
  ambulanciaId: string; // uid de la ambulancia
  direccion: string;
  lat: number;
  lng: number;
  estado: EmergencyStatus;
  createdAt: number; // timestamp
}
