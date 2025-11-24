'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, useAuth } from '@/lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const router = useRouter();
  const { user, loading } = useAuth();

  // Si ya está logueado, redirigimos según rol
  if (!loading && user) {
    if (user.role === 'admin') router.replace('/admin');
    else router.replace('/ambulancia');
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoadingLogin(true);
    try {
      await login(email, password);
      // onAuthStateChanged se encargará de redirigir
    } catch (err: any) {
      setError(err.message ?? 'Error al iniciar sesión');
    } finally {
      setLoadingLogin(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-xl shadow-md w-full max-w-sm space-y-4"
      >
        <h1 className="text-xl font-bold text-center">Sistema de ambulancias</h1>
        <input
          type="email"
          placeholder="Correo"
          className="w-full border rounded px-3 py-2"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Contraseña"
          className="w-full border rounded px-3 py-2"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loadingLogin}
          className="w-full py-2 rounded bg-blue-600 text-white font-semibold disabled:opacity-50"
        >
          {loadingLogin ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
