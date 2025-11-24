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
import type { Emergency, AppUser } from '@/types';
import Script from 'next/script';

// Extendemos Emergency localmente para incluir prioridad
type AdminEmergency = Emergency & {
  priority?: 'baja' | 'media' | 'alta';
};

type AmbulanciaOption = {
  id: string;
  displayName: string;
  email: string | null;
};

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

// ---- Página de Admin ----

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [direccion, setDireccion] = useState('');
  const [ambulanciaId, setAmbulanciaId] = useState('');
  const [priority, setPriority] = useState<'baja' | 'media' | 'alta'>('media');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

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
        list.push({
          id: docSnap.id,
          ambulanciaId: data.ambulanciaId,
          direccion: data.direccion,
          lat: data.lat,
          lng: data.lng,
          estado: data.estado,
          createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
          priority: data.priority ?? 'media',
        });
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

    try {
      setCreating(true);
      await addDoc(collection(db, 'emergencias'), {
        ambulanciaId,
        direccion,
        lat,
        lng,
        estado: 'pendiente',
        priority,
        createdAt: serverTimestamp(),
      });

      // Limpiar solo dirección y coords (mantener selección de ambulancia si quieres)
      setDireccion('');
      setLat(null);
      setLng(null);
      setPriority('media');
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

      {/* Crear emergencia */}
      <section className="bg-white rounded-xl p-4 shadow space-y-4">
        <h2 className="font-semibold text-lg">Crear emergencia</h2>

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
                  setPriority(e.target.value as 'baja' | 'media' | 'alta')
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
                <p className="font-semibold">{e.direccion}</p>
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
