'use client';

import { useAuth } from '@/lib/auth';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Si el usuario ya está logueado, lo mandamos a su panel
  useEffect(() => {
    if (loading) return;
    if (!user) return;

    if (user.role === 'admin') router.push('/admin');
    if (user.role === 'ambulancia') router.push('/ambulancia');
  }, [user, loading, router]);

  if (loading) return <p className="p-4">Cargando...</p>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100">
      <div className="bg-white shadow-xl rounded-2xl p-8 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-4">Sistema de Ambulancias</h1>
        <p className="text-slate-600 mb-8">
          Accede como administrador o ambulancia para gestionar las emergencias.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/login')}
            className="bg-blue-600 text-white py-3 rounded-lg text-lg font-semibold hover:bg-blue-700"
          >
            Iniciar sesión
          </button>

        
        </div>
      </div>
    </div>
  );
}
