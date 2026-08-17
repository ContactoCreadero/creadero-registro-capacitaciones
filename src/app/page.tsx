'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import Login from '@/components/Login';
import AppShell from '@/components/AppShell';

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    // Carga inicial de sesión
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;

      setSession(data.session);

      if (!data.session) {
        setProfile(null);
        setLoading(false);
      }
    });

    // Escucha cambios reales de autenticación
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;

        setSession(nextSession);

        // IMPORTANTE:
        // No borrar el perfil en TOKEN_REFRESHED ni SIGNED_IN,
        // porque estos eventos pueden ocurrir al volver a la pestaña.
        if (event === 'SIGNED_OUT' || !nextSession) {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    void loadProfile(
      session.user.id,
      session.user.email ?? null
    );
  }, [session?.user?.id]);

  async function loadProfile(
    id: string,
    email: string | null
  ) {
    setLoading(true);
    setError('');

    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,role')
      .eq('id', id)
      .single();

    if (error || !data) {
      setError(
        'No se pudo cargar el perfil. Revisa la configuración del usuario.'
      );

      setProfile({
        id,
        email,
        full_name: null,
        role: 'user',
      });
    } else {
      setProfile(data as Profile);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <main className="splash">
        <img src="/logo.png" alt="Creadero" />
        <span>Cargando plataforma…</span>
      </main>
    );
  }

  if (!session) {
    return <Login />;
  }

  if (!profile) {
    return (
      <main className="splash">
        Cargando perfil…
      </main>
    );
  }

  return (
    <>
      {error && (
        <div className="global-warning">
          {error}
        </div>
      )}

      <AppShell profile={profile} />
    </>
  );
}