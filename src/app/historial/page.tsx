'use client';
import Link from 'next/link';
import { useAuth, logout } from '@/lib/auth';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import type {
  Emergency,
  EmergencyStatusTimestamps,
} from '@/types';

type Priority = 'baja' | 'media' | 'alta';

type HistEmergency = Emergency & {
  priority?: Priority;
};

type AmbulanciaOption = {
  id: string;
  displayName: string;
  email: string | null;
};

// Helpers
const normalizeTimestamp = (value: any): number | undefined => {
  if (!value) return undefined;
  if (typeof value === 'number') return value;
  if (value?.toMillis) return value.toMillis();
  return undefined;
};

function formatDate(ms?: number) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatTime(ms?: number) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistorialPage() {
  const { user, loading } = useAuth();

  const [emergencias, setEmergencias] = useState<HistEmergency[]>([]);
  const [ambulancias, setAmbulancias] = useState<AmbulanciaOption[]>([]);

  // Filtros / búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pacienteNombre, setPacienteNombre] = useState('');
  const [ambulanciaIdFilter, setAmbulanciaIdFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('');
  const [ciudad, setCiudad] = useState('');

  // Redirección si no hay usuario
  useEffect(() => {
    if (!user && !loading) {
      window.location.href = '/login';
    }
  }, [user, loading]);

  // Cargar últimas N emergencias (por ejemplo 100) para historial
  useEffect(() => {
    const q = query(
      collection(db, 'emergencias'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, snap => {
      const list: HistEmergency[] = [];
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
          folio: data.folio,
          tipoServicio: data.tipoServicio,
          descripcion: data.descripcion,
          paciente: data.paciente,

          direccion: data.direccion,
          lat: data.lat,
          lng: data.lng,

          ambulanciaId: data.ambulanciaId,
          estado: data.estado,

          createdAt: createdAtMs,
          statusTimestamps,
          priority: (data.priority ?? 'media') as Priority,
        } as HistEmergency);
      });

      setEmergencias(list);
    });

    return () => unsub();
  }, []);

  // Cargar ambulancias para mostrar nombres
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, snap => {
      const list: AmbulanciaOption[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as any;
        if (data.role === 'ambulancia') {
          list.push({
            id: docSnap.id,
            displayName: data.displayName ?? 'Ambulancia',
            email: data.email ?? null,
          });
        }
      });
      setAmbulancias(list);
    });

    return () => unsub();
  }, []);

  const getAmbulanciaLabel = (id: string) => {
    const a = ambulancias.find(x => x.id === id);
    if (!a) return id || '—';
    return a.email ? `${a.displayName} (${a.email})` : a.displayName;
  };

  const limpiarFiltros = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setPacienteNombre('');
    setAmbulanciaIdFilter('');
    setPriorityFilter('');
    setCiudad('');
  };

  // Filtrado
  const filteredEmergencias = useMemo(() => {
    const hasFilters =
      searchTerm.trim() ||
      dateFrom ||
      dateTo ||
      pacienteNombre.trim() ||
      ambulanciaIdFilter ||
      priorityFilter ||
      ciudad.trim();

    // Si no hay filtros → solo mostramos las últimas 10
    const baseList = hasFilters ? emergencias : emergencias.slice(0, 10);

    const search = searchTerm.trim().toLowerCase();
    const pacienteSearch = pacienteNombre.trim().toLowerCase();
    const ciudadSearch = ciudad.trim().toLowerCase();

    const fromMs = dateFrom
      ? new Date(dateFrom + 'T00:00:00').getTime()
      : undefined;
    const toMs = dateTo
      ? new Date(dateTo + 'T23:59:59.999').getTime()
      : undefined;

    return baseList.filter(e => {
      // Filtro por fecha
      if (fromMs && e.createdAt < fromMs) return false;
      if (toMs && e.createdAt > toMs) return false;

      // Filtro por prioridad
      if (priorityFilter && e.priority !== priorityFilter) return false;

      // Filtro por ambulancia
      if (ambulanciaIdFilter && e.ambulanciaId !== ambulanciaIdFilter) {
        return false;
      }

      // Filtro por nombre de paciente
      if (pacienteSearch) {
        const nombre = (e.paciente?.nombre || '').toLowerCase();
        if (!nombre.includes(pacienteSearch)) return false;
      }

      // Filtro por ciudad (en la dirección)
      if (ciudadSearch) {
        const dir = (e.direccion || '').toLowerCase();
        if (!dir.includes(ciudadSearch)) return false;
      }

      // Filtro de texto libre (folio, descripción, dirección, paciente, ambulancia, prioridad)
      if (search) {
        const folio = (e.folio || '').toLowerCase();
        const desc = (e.descripcion || '').toLowerCase();
        const dir = (e.direccion || '').toLowerCase();
        const nombre = (e.paciente?.nombre || '').toLowerCase();
        const amb = getAmbulanciaLabel(e.ambulanciaId).toLowerCase();
        const prio = (e.priority || '').toLowerCase();

        const hayCoincidencia =
          folio.includes(search) ||
          desc.includes(search) ||
          dir.includes(search) ||
          nombre.includes(search) ||
          amb.includes(search) ||
          prio.includes(search);

        if (!hayCoincidencia) return false;
      }

      return true;
    });
  }, [
    emergencias,
    searchTerm,
    dateFrom,
    dateTo,
    pacienteNombre,
    ambulanciaIdFilter,
    priorityFilter,
    ciudad,
    ambulancias,
  ]);

  if (loading || !user) return <p>Cargando...</p>;
  if (user.role !== 'admin') return <p>No autorizado</p>;

  return (
    <div className="min-h-screen p-4 bg-slate-100 space-y-4">
      <header className="flex justify-between items-center mb-2">
            <Link
  href="/admin"
  className="px-3 py-1 rounded bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 transition"
>
  Panel de Admin
</Link>
        <h1 className="text-2xl font-bold">Historial</h1>
        <button
          onClick={logout}
          className="px-3 py-1 rounded bg-red-500 text-white text-sm"
        >
          Salir
        </button>
      </header>

      {/* Filtros / búsqueda */}
      <section className="bg-white rounded-xl p-4 shadow space-y-3">
        <h2 className="font-semibold text-lg">Buscar en el historial</h2>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Búsqueda general
            </label>
            <input
              type="text"
              className="border rounded px-3 py-2 w-full text-sm"
              placeholder="Buscar por folio, descripción, dirección, paciente, ambulancia..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Fecha desde
            </label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full text-sm"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Fecha hasta
            </label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full text-sm"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nombre de paciente
            </label>
            <input
              type="text"
              className="border rounded px-3 py-2 w-full text-sm"
              placeholder="Nombre del paciente / cliente"
              value={pacienteNombre}
              onChange={e => setPacienteNombre(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Ambulancia
            </label>
            <select
              className="border rounded px-3 py-2 w-full text-sm"
              value={ambulanciaIdFilter}
              onChange={e => setAmbulanciaIdFilter(e.target.value)}
            >
              <option value="">Todas</option>
              {ambulancias.map(a => (
                <option key={a.id} value={a.id}>
                  {a.displayName} {a.email ? `(${a.email})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Prioridad
            </label>
            <select
              className="border rounded px-3 py-2 w-full text-sm"
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value as Priority | '')}
            >
              <option value="">Todas</option>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Ciudad
            </label>
            <input
              type="text"
              className="border rounded px-3 py-2 w-full text-sm"
              placeholder="Buscar dentro de la dirección (ej. Monterrey)"
              value={ciudad}
              onChange={e => setCiudad(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-slate-500">
            Sin filtros activos se muestran solo las últimas 10 emergencias.
          </p>
          <button
            type="button"
            onClick={limpiarFiltros}
            className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs"
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      {/* Lista de resultados */}
      <section className="bg-white rounded-xl p-4 shadow space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-lg">Resultados</h2>
          <p className="text-xs text-slate-500">
            Mostrando {filteredEmergencias.length}{' '}
            {filteredEmergencias.length === 1 ? 'emergencia' : 'emergencias'}
          </p>
        </div>

        {filteredEmergencias.length === 0 ? (
          <p className="text-sm text-slate-500">
            No se encontraron emergencias con los filtros actuales.
          </p>
        ) : (
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {filteredEmergencias.map(e => (
              <div
                key={e.id}
                className="border rounded-lg px-3 py-2 text-sm flex flex-col md:flex-row md:justify-between md:items-start gap-2"
              >
                <div className="space-y-0.5">
                  {e.folio && (
                    <p className="text-[11px] font-semibold text-slate-500">
                      Folio: {e.folio}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Fecha: {formatDate(e.createdAt)} · Hora:{' '}
                    {formatTime(e.createdAt)}
                  </p>
                  <p className="font-semibold">{e.direccion}</p>
                  {e.tipoServicio && (
                    <p className="text-[11px] uppercase text-slate-500">
                      Tipo: {e.tipoServicio}
                    </p>
                  )}
                  <p className="text-xs text-slate-600">
                    Ambulancia: {getAmbulanciaLabel(e.ambulanciaId)}
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
                    <div className="mt-1 text-[11px] text-slate-600 space-y-0.5">
                      <p className="font-semibold text-[11px] text-slate-500">
                        Paciente / cliente
                      </p>
                      {e.paciente.nombre && (
                        <p>Nombre: {e.paciente.nombre}</p>
                      )}
                      {typeof e.paciente.edad !== 'undefined' && (
                        <p>Edad: {e.paciente.edad} años</p>
                      )}
                      {e.paciente.telefono && (
                        <p>Teléfono: {e.paciente.telefono}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-600 space-y-0.5 md:text-right">
                  <p>
                    Estado:{' '}
                    <span className="font-semibold uppercase">
                      {e.estado}
                    </span>
                  </p>
                  {e.statusTimestamps && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
