'use client';

import {
  useEffect,
  useState,
} from 'react';

import type {
  Session,
} from '@supabase/supabase-js';

import {
  supabase,
} from '@/lib/supabase';

import type {
  Profile,
} from '@/lib/types';

import Login from '@/components/Login';
import AppShell from '@/components/AppShell';

export default function Page() {
  const [
    session,
    setSession,
  ] =
    useState<Session | null>(
      null
    );

  const [
    profile,
    setProfile,
  ] =
    useState<Profile | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState('');

  /*
   * ==========================================
   * CONTROL DE SESIÓN
   * ==========================================
   *
   * IMPORTANTE:
   *
   * Supabase puede emitir eventos como
   * SIGNED_IN o TOKEN_REFRESHED cuando
   * vuelves a una pestaña del navegador.
   *
   * No debemos borrar el perfil en esos
   * eventos.
   */

  useEffect(() => {
    let mounted = true;

    /*
     * Cargar la sesión existente
     * al abrir la aplicación.
     */

    void supabase.auth
      .getSession()
      .then(
        ({
          data,
          error:
            sessionError,
        }) => {
          if (!mounted) {
            return;
          }

          if (
            sessionError
          ) {
            console.error(
              'Error al recuperar sesión:',
              sessionError
            );

            setSession(null);
            setProfile(null);
            setLoading(false);

            return;
          }

          setSession(
            data.session
          );

          /*
           * Si no existe sesión,
           * mostramos Login.
           *
           * Si existe sesión,
           * loadProfile() será
           * ejecutado por el
           * siguiente useEffect.
           */
          if (
            !data.session
          ) {
            setProfile(null);
            setLoading(false);
          }
        }
      );

    /*
     * Escuchar cambios de
     * autenticación.
     */

    const {
      data:
        authListener,
    } =
      supabase.auth
        .onAuthStateChange(
          (
            event,
            nextSession
          ) => {
            if (!mounted) {
              return;
            }

            /*
             * Siempre actualizamos
             * la sesión.
             */
            setSession(
              nextSession
            );

            /*
             * SOLO borrar el perfil
             * cuando realmente se
             * cierra la sesión.
             *
             * No hacerlo durante:
             *
             * SIGNED_IN
             * TOKEN_REFRESHED
             * USER_UPDATED
             *
             * porque estos eventos
             * pueden ocurrir al
             * cambiar de pestaña.
             */
            if (
              event ===
                'SIGNED_OUT' ||
              !nextSession
            ) {
              setProfile(null);
              setError('');
              setLoading(false);
            }
          }
        );

    return () => {
      mounted = false;

      authListener
        .subscription
        .unsubscribe();
    };
  }, []);

  /*
   * ==========================================
   * CARGAR PERFIL
   * ==========================================
   *
   * Solo se vuelve a cargar cuando cambia
   * realmente el usuario autenticado.
   *
   * Un refresh del token NO provoca que
   * perdamos el perfil.
   */

  useEffect(() => {
    if (
      !session?.user
    ) {
      return;
    }

    void loadProfile(
      session.user.id,
      session.user.email ??
        null
    );
  }, [
    session?.user?.id,
  ]);

  async function loadProfile(
    id: string,
    email: string | null
  ) {
    setLoading(true);
    setError('');

    const {
      data,
      error:
        profileError,
    } =
      await supabase
        .from('profiles')
        .select(
          'id,email,full_name,role'
        )
        .eq(
          'id',
          id
        )
        .single();

    /*
     * Si por algún motivo
     * no puede leerse profiles,
     * usamos un perfil limitado
     * de tipo user.
     *
     * Nunca otorgamos admin
     * como fallback.
     */
    if (
      profileError ||
      !data
    ) {
      console.error(
        'Error al cargar perfil:',
        profileError
      );

      setError(
        'No se pudo cargar correctamente el perfil del usuario. Se aplicaron permisos restringidos.'
      );

      setProfile({
        id,
        email,
        full_name:
          null,
        role:
          'user',
      });

      setLoading(false);

      return;
    }

    setProfile(
      data as Profile
    );

    setLoading(false);
  }

  /*
   * ==========================================
   * CARGANDO
   * ==========================================
   */

  if (loading) {
    return (
      <main className="splash">

        <img
          src="/logo.png"
          alt="Creadero"
        />

        <span>
          Cargando plataforma…
        </span>

      </main>
    );
  }

  /*
   * ==========================================
   * SIN SESIÓN
   * ==========================================
   */

  if (!session) {
    return (
      <Login />
    );
  }

  /*
   * ==========================================
   * SESIÓN EXISTENTE PERO PERFIL
   * TODAVÍA NO DISPONIBLE
   * ==========================================
   *
   * Ya no mostramos:
   *
   * "No fue posible cargar la aplicación"
   *
   * mientras Supabase procesa un evento
   * de autenticación.
   */

  if (!profile) {
    return (
      <main className="splash">

        <img
          src="/logo.png"
          alt="Creadero"
        />

        <span>
          Cargando perfil…
        </span>

      </main>
    );
  }

  /*
   * ==========================================
   * APLICACIÓN
   * ==========================================
   */

  return (
    <>
      {error && (
        <div className="global-warning">
          {error}
        </div>
      )}

      <AppShell
        profile={
          profile
        }
      />
    </>
  );
}