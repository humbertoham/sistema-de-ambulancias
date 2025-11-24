'use client';

import { useAuth, logout } from '@/lib/auth';
import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  doc,
} from 'firebase/firestore';
import type { Emergency, EmergencyStatus } from '@/types';
import Script from 'next/script';

type Priority = 'baja' | 'media' | 'alta';

type AmbulanceEmergency = Emergency & {
  priority?: Priority;
};

type LatLng = {
  lat: number;
  lng: number;
};

export default function AmbulanciaPage() {
  const { user, loading } = useAuth();

  const [emergencias, setEmergencias] = useState<AmbulanceEmergency[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [currentPosition, setCurrentPosition] = useState<LatLng | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const directionsServiceRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);

  // Para controlar cada cuánto pedimos nueva ruta (throttle)
  const lastRouteUpdateRef = useRef<number>(0);
  const prevSelectedIdRef = useRef<string | null>(null);

  // Redirigir si no hay usuario
  useEffect(() => {
    if (!user && !loading) {
      window.location.href = '/login';
    }
  }, [user, loading]);

  // Escuchar emergencias asignadas a esta ambulancia
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'emergencias'),
      where('ambulanciaId', '==', user.uid)
    );

    const unsub = onSnapshot(q, snap => {
      const list: AmbulanceEmergency[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as any;

        // Ignoramos finalizadas para la vista principal
        if (data.estado === 'finalizada') return;

        list.push({
          id: docSnap.id,
          ambulanciaId: data.ambulanciaId,
          direccion: data.direccion,
          lat: data.lat,
          lng: data.lng,
          estado: data.estado,
          createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
          priority: (data.priority ?? 'media') as Priority,
        });
      });

      setEmergencias(list);

      if (list.length > 0) {
        // si no hay seleccionada, o la que estaba seleccionada ya no existe,
        // seleccionamos la primera
        const stillSelected = list.find(e => e.id === selectedId);
        const newSelectedId = stillSelected ? stillSelected.id : list[0].id;
        setSelectedId(newSelectedId);

        // forzamos recálculo de ruta cuando cambie de emergencia
        prevSelectedIdRef.current = null;
      } else {
        setSelectedId(null);
      }
    });

    return () => unsub();
  }, [user, selectedId]);

  const selectedEmergencia =
    emergencias.find(e => e.id === selectedId) ?? emergencias[0] ?? null;

  // Geolocalización de la ambulancia (gratis, hardware del dispositivo)
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn('Geolocation no disponible en este navegador.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      pos => {
        setCurrentPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      err => {
        console.warn('Error en geolocalización:', err);
      },
      {
        enableHighAccuracy: false, // menos consumo de batería / GPS
        maximumAge: 10000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Inicializar mapa + ruta cuando todo está listo
  useEffect(() => {
    if (!mapsLoaded) return;
    if (!mapContainerRef.current) return;
    if (!selectedEmergencia) return;
    if (!currentPosition) return;

    const google = (window as any).google;
    if (!google) return;

    // Crear mapa una sola vez
    if (!mapRef.current) {
      mapRef.current = new google.maps.Map(mapContainerRef.current, {
        center: currentPosition,
        zoom: 14,
        disableDefaultUI: false,
      });

      directionsServiceRef.current = new google.maps.DirectionsService();
      directionsRendererRef.current = new google.maps.DirectionsRenderer({
        map: mapRef.current,
        suppressMarkers: false,
      });
    }

    const now = Date.now();
    const selectedChanged =
      prevSelectedIdRef.current !== (selectedEmergencia?.id ?? null);

    // Si no cambió la emergencia y la última ruta fue hace menos de 60s,
    // no volvemos a llamar Directions (ahorro de costo).
    if (!selectedChanged && now - lastRouteUpdateRef.current < 60000) {
      return;
    }

    prevSelectedIdRef.current = selectedEmergencia.id;

    const origin = currentPosition;
    const destination = {
      lat: selectedEmergencia.lat,
      lng: selectedEmergencia.lng,
    };

    directionsServiceRef.current.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result: any, status: string) => {
        if (status === 'OK') {
          directionsRendererRef.current.setDirections(result);
          lastRouteUpdateRef.current = Date.now();
        } else {
          console.error('Error calculando ruta:', status);
        }
      }
    );
  }, [mapsLoaded, selectedEmergencia, currentPosition]);

  const cambiarEstado = async (estado: EmergencyStatus) => {
    if (!selectedEmergencia) return;
    await updateDoc(doc(db, 'emergencias', selectedEmergencia.id), { estado });
  };

  const finalizarEmergencia = async () => {
    if (!selectedEmergencia) return;
    await cambiarEstado('finalizada');
  };

  const abrirEnGoogleMaps = () => {
    if (!selectedEmergencia) return;
    const { lat, lng } = selectedEmergencia;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
      '_blank'
    );
  };

  if (loading || !user) return <p>Cargando...</p>;
  if (user.role !== 'ambulancia') return <p>No autorizado</p>;

  return (
    <div className="min-h-screen p-4 bg-slate-100 flex flex-col gap-4">
      {/* Google Maps JS */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
        strategy="afterInteractive"
        onLoad={() => setMapsLoaded(true)}
      />

      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Ambulancia</h1>
        <button
          onClick={logout}
          className="px-3 py-1 rounded bg-red-500 text-white text-sm"
        >
          Salir
        </button>
      </header>

      <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
        {/* Panel principal */}
        <div className="bg-white rounded-xl p-4 shadow flex flex-col gap-4">
          {!selectedEmergencia ? (
            <p className="text-slate-600">No tienes emergencias asignadas.</p>
          ) : (
            <>
              <div>
                <p className="font-semibold text-lg">Emergencia asignada</p>
                <p className="text-sm text-slate-700">
                  {selectedEmergencia.direccion}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Estado:{' '}
                  <span className="font-semibold">
                    {selectedEmergencia.estado}
                  </span>
                </p>
                {selectedEmergencia.priority && (
                  <p className="text-xs mt-1">
                    Prioridad:{' '}
                    <span
                      className={
                        selectedEmergencia.priority === 'alta'
                          ? 'text-red-600 font-semibold'
                          : selectedEmergencia.priority === 'baja'
                          ? 'text-green-600'
                          : 'text-amber-600'
                      }
                    >
                      {selectedEmergencia.priority.toUpperCase()}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-1">
                  Ruta hacia la emergencia
                </p>
                {!currentPosition && (
                  <p className="text-xs text-slate-500 mb-1">
                    Obteniendo ubicación actual de la unidad...
                  </p>
                )}
                <div
                  ref={mapContainerRef}
                  className="w-full h-64 rounded-xl border border-slate-300"
                />
                <button
                  onClick={abrirEnGoogleMaps}
                  className="mt-2 px-3 py-1 rounded bg-slate-800 text-white text-xs"
                >
                  Abrir en Google Maps
                </button>
              </div>

              <div className="flex gap-2 flex-wrap mt-2">
                <button
                  onClick={() => cambiarEstado('en_camino')}
                  className="px-3 py-2 rounded bg-blue-600 text-white text-sm"
                >
                  En camino
                </button>
                <button
                  onClick={() => cambiarEstado('en_sitio')}
                  className="px-3 py-2 rounded bg-amber-500 text-white text-sm"
                >
                  En sitio
                </button>
                <button
                  onClick={finalizarEmergencia}
                  className="px-3 py-2 rounded bg-green-600 text-white text-sm"
                >
                  Finalizar
                </button>
              </div>
            </>
          )}
        </div>

        {/* Lista de emergencias */}
        <div className="bg-white rounded-xl p-4 shadow flex flex-col gap-3">
          <h2 className="font-semibold text-lg">Tus emergencias</h2>
          {emergencias.length === 0 ? (
            <p className="text-sm text-slate-500">
              No hay emergencias activas asignadas a esta unidad.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
              {emergencias.map(e => (
                <button
                  key={e.id}
                  onClick={() => {
                    setSelectedId(e.id);
                    prevSelectedIdRef.current = null; // fuerza recálculo de ruta
                  }}
                  className={`text-left border rounded-lg px-3 py-2 text-sm ${
                    selectedEmergencia?.id === e.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-semibold truncate">{e.direccion}</p>
                  <p className="text-xs text-slate-500">
                    Estado: <span className="font-semibold">{e.estado}</span>
                  </p>
                  {e.priority && (
                    <p className="text-xs">
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
                        {e.priority}
                      </span>
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
