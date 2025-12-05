'use client';

import { useAuth, logout } from '@/lib/auth';
import { useEffect, useState, FormEvent, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import type {
  Emergency,
  ServiceType,
  EmergencyStatusTimestamps,
} from '@/types';
import Script from 'next/script';

// ---- Tipos locales ----

type Priority = 'baja' | 'media' | 'alta';

type AdminEmergency = Emergency & {
  priority?: Priority;
};

type AmbulanciaOption = {
  id: string;
  displayName: string;
  email: string | null;
};

// ---- Helpers ----

const normalizeTimestamp = (value: any): number | undefined => {
  if (!value) return undefined;
  if (typeof value === 'number') return value;
  if (value?.toMillis) return value.toMillis();
  return undefined;
};

function formatTime(ms?: number) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- Componente para elegir ubicación con buscador + mapa ----

type LocationPickerProps = {
  direccion: string;
  onDireccionChange: (value: string) => void;
  lat: number | null;
  lng: number | null;
  onLocationChange: (lat: number, lng: number) => void;
};

const DEFAULT_CENTER = {
  lat: 25.6866, // Monterrey aprox
  lng: -100.3161,
};

function LocationPicker({
  direccion,
  onDireccionChange,
  lat,
  lng,
  onLocationChange,
}: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const autocompleteRef = useRef<any>(null);

  const handleScriptLoad = () => {
    const google = (window as any).google;
    if (!google || !mapContainerRef.current) return;

    const center = lat != null && lng != null ? { lat, lng } : DEFAULT_CENTER;

    // Crear mapa
    const map = new google.maps.Map(mapContainerRef.current, {
      center,
      zoom: 14,
      disableDefaultUI: false,
    });
    mapRef.current = map;

    // Crear marker inicial
    const marker = new google.maps.Marker({
      position: center,
      map,
      draggable: false,
    });
    markerRef.current = marker;

    // Click en el mapa → mueve el pin y actualiza lat/lng
    map.addListener('click', (e: any) => {
      const pos = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng(),
      };
      marker.setPosition(pos);
      onLocationChange(pos.lat, pos.lng);
    });

    // Autocomplete del buscador
    const input = document.getElementById(
      'direccion-search-input'
    ) as HTMLInputElement | null;

    if (input) {
      const autocomplete = new google.maps.places.Autocomplete(input);
      autocompleteRef.current = autocomplete;

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        const pos = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };

        map.panTo(pos);
        map.setZoom(16);
        marker.setPosition(pos);

        onLocationChange(pos.lat, pos.lng);
        onDireccionChange(place.formatted_address || input.value);
      });
    }
  };

  return (
    <div className="space-y-2">
      {/* Cargamos Google Maps + Places */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
        onLoad={handleScriptLoad}
      />

      <label className="block text-sm font-medium text-slate-700 mb-1">
        Ubicación de la emergencia
      </label>
      <input
        id="direccion-search-input"
        type="text"
        placeholder="Buscar dirección o mover el pin en el mapa"
        className="border rounded px-3 py-2 w-full"
        value={direccion}
        onChange={e => onDireccionChange(e.target.value)}
      />
      <div
        ref={mapContainerRef}
        className="w-full h-72 rounded-xl border border-slate-300 mt-2"
      />
    </div>
  );
}

// ---- Generar folio automático ----

function generateFolio() {
  const now = Date.now();
  // Ejemplo: SRV-123456 (últimos 6 dígitos del timestamp)
  return 'SRV-' + now.toString().slice(-6);
}

// ---- Página de Admin ----

export default function AdminPage() {
  const { user, loading } = useAuth();

  // Ubicación
  const [direccion, setDireccion] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // Asignación
  const [ambulanciaId, setAmbulanciaId] = useState('');
  const [priority, setPriority] = useState<Priority>('media');

  // Datos del servicio
  const [tipoServicio, setTipoServicio] = useState<ServiceType>('emergencia');
  const [descripcion, setDescripcion] = useState('');

  // Información general del paciente/cliente
  const [pacienteNombre, setPacienteNombre] = useState('');
  const [pacienteEdad, setPacienteEdad] = useState('');
  const [pacienteTelefono, setPacienteTelefono] = useState('');

  const [emergencias, setEmergencias] = useState<AdminEmergency[]>([]);
  const [ambulancias, setAmbulancias] = useState<AmbulanciaOption[]>([]);
  const [creating, setCreating] = useState(false);

  // Redirección si no está logueado
  useEffect(() => {
    if (!user && !loading) {
      window.location.href = '/login';
    }
  }, [user, loading]);

  // Cargar emergencias
  useEffect(() => {
    const q = query(collection(db, 'emergencias'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const list: AdminEmergency[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as any;

        const createdAtMs =
          typeof data.createdAt === 'number'
            ? data.createdAt
            : data.createdAt?.toMillis?.() ?? Date.now();

        const statusRaw = data.statusTimestamps ?? {};
        const statusTimestamps: EmergencyStatusTimestamps = {
          pendiente:
            normalizeTimestamp(statusRaw.pendiente) ?? createdAtMs,
          en_camino: normalizeTimestamp(statusRaw.en_camino),
          en_sitio: normalizeTimestamp(statusRaw.en_sitio),
          finalizada: normalizeTimestamp(statusRaw.finalizada),
        };

        list.push({
          id: docSnap.id,
          ambulanciaId: data.ambulanciaId,
          direccion: data.direccion,
          lat: data.lat,
          lng: data.lng,
          estado: data.estado,
          createdAt: createdAtMs,
          priority: (data.priority ?? 'media') as Priority,

          folio: data.folio,
          tipoServicio: data.tipoServicio,
          descripcion: data.descripcion,
          paciente: data.paciente,
          statusTimestamps,
        } as AdminEmergency);
      });
      setEmergencias(list);
    });

    return () => unsub();
  }, []);

  // Cargar ambulancias (usuarios con role = 'ambulancia')
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'ambulancia'));
    const unsub = onSnapshot(q, snap => {
      const list: AmbulanciaOption[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as any;
        list.push({
          id: docSnap.id,
          displayName: data.displayName ?? 'Ambulancia',
          email: data.email ?? null,
        });
      });
      setAmbulancias(list);
    });

    return () => unsub();
  }, []);

  const handleCreateEmergency = async (e: FormEvent) => {
    e.preventDefault();

    if (!direccion || !ambulanciaId || lat == null || lng == null) {
      alert('Falta dirección, ambulancia o ubicación en el mapa.');
      return;
    }

    if (!descripcion || !tipoServicio || !pacienteNombre) {
      alert(
        'Falta descripción del servicio o nombre del paciente/cliente.'
      );
      return;
    }

    const edadNumber =
      pacienteEdad.trim() !== '' ? Number(pacienteEdad.trim()) : undefined;

    try {
      setCreating(true);

      const folio = generateFolio();
      const ahora = Date.now();

      await addDoc(collection(db, 'emergencias'), {
        ambulanciaId,
        direccion,
        lat,
        lng,
        estado: 'pendiente',
        priority,
        createdAt: serverTimestamp(), // lo normalizamos al leer

        folio,
        tipoServicio,
        descripcion,
        paciente: {
          nombre: pacienteNombre,
          ...(edadNumber && !isNaN(edadNumber) ? { edad: edadNumber } : {}),
          telefono: pacienteTelefono || undefined,
        },

        statusTimestamps: {
          pendiente: ahora, // número, compatible con tu type
        } as EmergencyStatusTimestamps,
      });

      // Limpiar formulario
      setDireccion('');
      setLat(null);
      setLng(null);
      setPriority('media');
      setTipoServicio('emergencia');
      setDescripcion('');
      setPacienteNombre('');
      setPacienteEdad('');
      setPacienteTelefono('');
    } finally {
      setCreating(false);
    }
  };

  if (loading || !user) return <p>Cargando...</p>;
  if (user.role !== 'admin') return <p>No autorizado</p>;

  return (
    <div className="min-h-screen p-4 space-y-4 bg-slate-100">
      <header className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-bold">Panel administrador</h1>
        <button
          onClick={logout}
          className="px-3 py-1 rounded bg-red-500 text-white text-sm"
        >
          Salir
        </button>
      </header>

      {/* Crear emergencia / servicio */}
      <section className="bg-white rounded-xl p-4 shadow space-y-4">
        <h2 className="font-semibold text-lg">Crear emergencia / servicio</h2>

        <form onSubmit={handleCreateEmergency} className="space-y-4">
          {/* Picker de ubicación */}
          <LocationPicker
            direccion={direccion}
            onDireccionChange={setDireccion}
            lat={lat}
            lng={lng}
            onLocationChange={(newLat, newLng) => {
              setLat(newLat);
              setLng(newLng);
            }}
          />

          {/* Tipo de servicio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tipo de servicio
              </label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={tipoServicio}
                onChange={e =>
                  setTipoServicio(e.target.value as ServiceType)
                }
              >
                <option value="evento">Evento</option>
                <option value="traslado">Traslado</option>
                <option value="emergencia">Emergencia</option>
                <option value="membresia">Membresía</option>
              </select>
            </div>
          </div>

          {/* Descripción del servicio */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descripción del servicio / reporte
            </label>
            <textarea
              className="border rounded px-3 py-2 w-full min-h-[90px]"
              placeholder="Descripción del motivo de la llamada, hallazgos, etc."
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
            />
          </div>

          {/* Información general del paciente / cliente */}
          <div className="border rounded-lg p-3 space-y-3 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">
              Información general del paciente / cliente
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  className="border rounded px-3 py-2 w-full"
                  value={pacienteNombre}
                  onChange={e => setPacienteNombre(e.target.value)}
                  placeholder="Nombre completo"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Edad
                </label>
                <input
                  type="number"
                  className="border rounded px-3 py-2 w-full"
                  value={pacienteEdad}
                  onChange={e => setPacienteEdad(e.target.value)}
                  placeholder="Años"
                  min={0}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  className="border rounded px-3 py-2 w-full"
                  value={pacienteTelefono}
                  onChange={e => setPacienteTelefono(e.target.value)}
                  placeholder="Teléfono de contacto"
                />
              </div>
            </div>
          </div>

          {/* Selección de ambulancia + prioridad + botón */}
          <div className="flex flex-col md:flex-row gap-2 md:items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Ambulancia
              </label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={ambulanciaId}
                onChange={e => setAmbulanciaId(e.target.value)}
              >
                <option value="">Selecciona una ambulancia</option>
                {ambulancias.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.displayName} {a.email ? `(${a.email})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Prioridad
              </label>
              <select
                className="border rounded px-3 py-2"
                value={priority}
                onChange={e =>
                  setPriority(e.target.value as Priority)
                }
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded bg-blue-600 text-white font-semibold md:self-auto self-stretch disabled:opacity-60"
            >
              {creating ? 'Creando...' : 'Asignar emergencia'}
            </button>
          </div>
        </form>
      </section>

      {/* Lista de emergencias */}
      <section className="bg-white rounded-xl p-4 shadow space-y-2">
        <h2 className="font-semibold text-lg">Emergencias</h2>
        <div className="space-y-2">
          {emergencias.map(e => (
            <div
              key={e.id}
              className="border rounded-lg px-3 py-2 flex flex-col md:flex-row md:items-center md:justify-between"
            >
              <div>
                {e.folio && (
                  <p className="text-xs font-semibold text-slate-500">
                    Folio: {e.folio}
                  </p>
                )}
                <p className="font-semibold">{e.direccion}</p>
                {e.tipoServicio && (
                  <p className="text-xs uppercase text-slate-500">
                    Tipo: {e.tipoServicio}
                  </p>
                )}
                <p className="text-sm text-slate-600">
                  Ambulancia: {e.ambulanciaId}
                </p>
                <p className="text-xs text-slate-500">
                  Prioridad:{' '}
                  <span
                    className={
                      e.priority === 'alta'
                        ? 'text-red-600 font-semibold'
                        : e.priority === 'baja'
                        ? 'text-green-600'
                        : 'text-amber-600'
                    }
                  >
                    {e.priority ?? 'media'}
                  </span>
                </p>

                {e.paciente && (
                  <div className="mt-1 text-xs text-slate-600 space-y-0.5">
                    <p className="font-semibold text-[11px] text-slate-500">
                      Paciente / cliente
                    </p>
                    {e.paciente.nombre && <p>Nombre: {e.paciente.nombre}</p>}
                    {typeof e.paciente.edad !== 'undefined' && (
                      <p>Edad: {e.paciente.edad} años</p>
                    )}
                    {e.paciente.telefono && (
                      <p>Teléfono: {e.paciente.telefono}</p>
                    )}
                  </div>
                )}

                {e.statusTimestamps && (
                  <div className="mt-1 text-[11px] text-slate-600 space-y-0.5">
                    <p className="font-semibold text-slate-700">
                      Tiempos de atención
                    </p>
                    <p>
                      Pendiente:{' '}
                      {formatTime(e.statusTimestamps.pendiente)}
                    </p>
                    <p>
                      En camino:{' '}
                      {formatTime(e.statusTimestamps.en_camino)}
                    </p>
                    <p>
                      En sitio:{' '}
                      {formatTime(e.statusTimestamps.en_sitio)}
                    </p>
                    <p>
                      Finalizada:{' '}
                      {formatTime(e.statusTimestamps.finalizada)}
                    </p>
                  </div>
                )}
              </div>

              <p className="text-sm font-semibold uppercase mt-1 md:mt-0">
                {e.estado}
              </p>
            </div>
          ))}
          {emergencias.length === 0 && (
            <p className="text-sm text-slate-500">No hay emergencias todavía.</p>
          )}
        </div>
      </section>
    </div>
  );
}
