'use client';

import {
  FormEvent,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';

/*
 * ==========================================
 * MI CONTRASEÑA
 * ==========================================
 *
 * Cada usuario cambia su propia
 * contraseña. Primero se verifica la
 * contraseña actual.
 */

const MIN_PASSWORD_LENGTH = 8;

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d6d6d4',
  borderRadius: 8,
  font: 'inherit',
  background: '#fff',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
};

export default function ChangePassword({
  email,
}: {
  email: string | null;
}) {
  const [current, setCurrent] =
    useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] =
    useState('');
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState('');
  const [success, setSuccess] =
    useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email) {
      setError(
        'Tu usuario no tiene correo registrado. Pide al administrador que cambie tu contraseña.'
      );
      return;
    }

    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(
        `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
      );
      return;
    }

    if (next !== repeat) {
      setError(
        'Las contraseñas nuevas no coinciden.'
      );
      return;
    }

    if (next === current) {
      setError(
        'La nueva contraseña debe ser distinta de la actual.'
      );
      return;
    }

    setBusy(true);

    const { error: checkError } =
      await supabase.auth.signInWithPassword(
        {
          email,
          password: current,
        }
      );

    if (checkError) {
      setBusy(false);
      setError(
        'La contraseña actual no es correcta.'
      );
      return;
    }

    const { error: updateError } =
      await supabase.auth.updateUser({
        password: next,
      });

    setBusy(false);

    if (updateError) {
      setError(
        updateError.code === 'same_password'
          ? 'La nueva contraseña debe ser distinta de la actual.'
          : updateError.code ===
              'weak_password'
            ? 'La contraseña es demasiado débil. Usa una más larga o con letras y números.'
            : updateError.message
      );
      return;
    }

    setCurrent('');
    setNext('');
    setRepeat('');
    setSuccess(
      'Contraseña actualizada. Úsala la próxima vez que ingreses.'
    );
  }

  return (
    <div className="page-stack">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">
            MI CUENTA
          </span>

          <h1>Mi contraseña</h1>

          <p>
            Cambia la contraseña con la que
            ingresas a la plataforma.
          </p>
        </div>
      </div>

      <section className="admin-panel">
        <form
          onSubmit={submit}
          style={{
            display: 'grid',
            gap: 14,
            maxWidth: 420,
          }}
        >
          <label style={labelStyle}>
            Contraseña actual
            <input
              style={inputStyle}
              type="password"
              value={current}
              onChange={(e) =>
                setCurrent(e.target.value)
              }
              autoComplete="current-password"
              required
            />
          </label>

          <label style={labelStyle}>
            Nueva contraseña
            <input
              style={inputStyle}
              type="password"
              value={next}
              onChange={(e) =>
                setNext(e.target.value)
              }
              placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
              autoComplete="new-password"
              required
            />
          </label>

          <label style={labelStyle}>
            Repetir nueva contraseña
            <input
              style={inputStyle}
              type="password"
              value={repeat}
              onChange={(e) =>
                setRepeat(e.target.value)
              }
              autoComplete="new-password"
              required
            />
          </label>

          {error && (
            <div className="alert error">
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                background: '#eef7ef',
                border:
                  '1px solid #b9dcbc',
                color: '#1e5b25',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 14,
              }}
            >
              {success}
            </div>
          )}

          <div>
            <button
              className="btn primary"
              disabled={busy}
            >
              {busy
                ? 'Guardando…'
                : 'Cambiar contraseña'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
