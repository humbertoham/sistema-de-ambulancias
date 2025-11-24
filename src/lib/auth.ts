'use client';

import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { AppUser } from '@/types';

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (!firebaseUser) {
        console.log('No hay usuario logueado');
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        console.log('Usuario logueado:', firebaseUser.email, firebaseUser.uid);

        const userRef = doc(db, 'users', firebaseUser.uid); // 👈 colección "users"
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          console.warn(
            'No se encontró documento en Firestore para este UID:',
            firebaseUser.uid
          );
          // ⚠️ DEFAULT DE EMERGENCIA. Si quieres forzar admin mientras pruebas,
          // puedes cambiar 'ambulancia' por 'admin' temporalmente.
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: 'ambulancia',
            displayName: firebaseUser.displayName ?? undefined,
          });
          setLoading(false);
          return;
        }

        const data = userSnap.data() as {
          role?: AppUser['role'];
          displayName?: string;
        };

        console.log('Datos Firestore del usuario:', data);

        const role: AppUser['role'] = (data.role ?? 'ambulancia');

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role,
          displayName: data.displayName ?? firebaseUser.displayName ?? undefined,
        });
      } catch (error) {
        console.error('Error obteniendo datos de usuario en Firestore:', error);
        // En caso de error, no reventamos la app, pero lo marcamos como ambulancia por defecto
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role: 'ambulancia',
          displayName: firebaseUser.displayName ?? undefined,
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return { user, loading };
}

export async function login(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  await signOut(auth);
}
