'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';
import type { Role } from '@/lib/types';
import { EditIcon } from './Icons';

/*
 * ==========================================
 * ADMINISTRACIÓN DE USUARIOS
 * ==========================================
 *
 * Toda la lógica real (crear, editar,
 * contraseñas, activar/desactivar,
 * eliminar) se ejecuta en el servidor:
 * /api/admin/users
 *
 * El servidor verifica que quien llama
 * sea admin; esta pantalla solo la
 * muestra AppShell a administradores.
 */

type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  active: boolean;
  last_sign_in_at: string | null;
  created_at: string;
  is_self: boolean;
};

type Mode =
  | { kind: 'none' }
  | { kind: 'edit'; id: string }
  | { kind: 'password'; id: string };

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

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 12,
  alignItems: 'end',
};

const successStyle: React.CSSProperties = {
  background: '#eef7ef',
  border: '1px solid #b9dcbc',
  color: '#1e5b25',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
};

async function api<T = unknown>(
  path: string,
  init?: {
    method?: string;
    body?: unknown;
  }
): Promise<T> {
  const { data } =
    await supabase.auth.getSession();

  const token =
    data.session?.access_token;

  if (!token) {
    throw new Error(
      'Tu sesión expiró. Vuelve a ingresar.'
    );
  }

  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body:
      init?.body !== undefined
        ? JSON.stringify(init.body)
        : undefined,
    cache: 'no-store',
  });

  const json = await res
    .json()
    .catch(() => null);

  if (!res.ok) {
    throw new Error(
      json?.error ||
        'Ocurrió un error inesperado.'
    );
  }

  return json as T;
}

function generatePassword() {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

  const values = new Uint32Array(12);
  crypto.getRandomValues(values);

  return Array.from(
    values,
    (v) => chars[v % chars.length]
  ).join('');
}

function formatDateTime(
  value: string | null
) {
  if (!value) return 'Nunca';

  return new Date(value).toLocaleString(
    'es-CL',
    {
      dateStyle: 'short',
      timeStyle: 'short',
    }
  );
}

export default function AdminUsers() {
  const [users, setUsers] =
    useState<AdminUser[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const [mode, setMode] =
    useState<Mode>({ kind: 'none' });

  // Formulario "nuevo usuario"
  const [newName, setNewName] =
    useState('');
  const [newEmail, setNewEmail] =
    useState('');
  const [newPassword, setNewPassword] =
    useState('');
  const [newRole, setNewRole] =
    useState<Role>('user');

  // Edición
  const [editName, setEditName] =
    useState('');
  const [editEmail, setEditEmail] =
    useState('');
  const [editRole, setEditRole] =
    useState<Role>('user');

  // Cambio de contraseña
  const [resetPassword, setResetPassword] =
    useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

    try {
      const data = await api<{
        users: AdminUser[];
      }>('/api/admin/users');

      setUsers(data.users);
    } catch (e) {
      setError((e as Error).message);
    }

    setLoading(false);
  }

  async function run(
    action: () => Promise<unknown>,
    okMessage: string
  ) {
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await action();
      setSuccess(okMessage);
      setMode({ kind: 'none' });
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();

    if (
      newPassword.length <
      MIN_PASSWORD_LENGTH
    ) {
      setError(
        `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
      );
      return;
    }

    const email = newEmail.trim();
    const password = newPassword;

    const ok = await run(
      () =>
        api('/api/admin/users', {
          method: 'POST',
          body: {
            full_name: newName,
            email,
            password,
            role: newRole,
          },
        }),
      `Usuario creado: ${email} · Contraseña: ${password} — cópiala y envíasela al usuario.`
    );

    if (ok) {
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
    }
  }

  function startEdit(user: AdminUser) {
    setError('');
    setSuccess('');
    setEditName(user.full_name ?? '');
    setEditEmail(user.email ?? '');
    setEditRole(user.role);
    setMode({ kind: 'edit', id: user.id });
  }

  function startPassword(user: AdminUser) {
    setError('');
    setSuccess('');
    setResetPassword(generatePassword());
    setMode({
      kind: 'password',
      id: user.id,
    });
  }

  async function saveEdit(user: AdminUser) {
    const body: Record<string, unknown> = {
      full_name: editName,
    };

    if (
      editEmail.trim().toLowerCase() !==
      (user.email ?? '').toLowerCase()
    ) {
      body.email = editEmail;
    }

    if (editRole !== user.role) {
      body.role = editRole;
    }

    await run(
      () =>
        api(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          body,
        }),
      'Usuario actualizado.'
    );
  }

  async function savePassword(
    user: AdminUser
  ) {
    if (
      resetPassword.length <
      MIN_PASSWORD_LENGTH
    ) {
      setError(
        `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
      );
      return;
    }

    const password = resetPassword;

    await run(
      () =>
        api(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          body: { password },
        }),
      `Nueva contraseña de ${user.email}: ${password} — cópiala y envíasela al usuario.`
    );
  }

  async function toggleActive(
    user: AdminUser
  ) {
    if (
      user.active &&
      !window.confirm(
        `¿Desactivar a ${user.full_name || user.email}? No podrá ingresar a la plataforma. Sus registros se conservan.`
      )
    ) {
      return;
    }

    await run(
      () =>
        api(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          body: { active: !user.active },
        }),
      user.active
        ? 'Usuario desactivado.'
        : 'Usuario activado.'
    );
  }

  async function remove(user: AdminUser) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente a ${user.full_name || user.email}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    await run(
      () =>
        api(`/api/admin/users/${user.id}`, {
          method: 'DELETE',
        }),
      'Usuario eliminado.'
    );
  }

  return (
    <div className="page-stack">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">
            ADMINISTRACIÓN
          </span>

          <h1>Usuarios</h1>

          <p>
            Crea usuarios, asigna su rol,
            cambia contraseñas y activa,
            desactiva o elimina accesos.
          </p>
        </div>
      </div>

      {/* ---------- NUEVO USUARIO ---------- */}

      <section className="admin-panel">
        <h2
          style={{
            fontSize: 16,
            margin: '0 0 14px',
          }}
        >
          Nuevo usuario
        </h2>

        <form
          onSubmit={create}
          style={gridStyle}
        >
          <label style={labelStyle}>
            Nombre completo
            <input
              style={inputStyle}
              value={newName}
              onChange={(e) =>
                setNewName(e.target.value)
              }
              placeholder="Ej: María González"
              required
            />
          </label>

          <label style={labelStyle}>
            Correo
            <input
              style={inputStyle}
              type="email"
              value={newEmail}
              onChange={(e) =>
                setNewEmail(e.target.value)
              }
              placeholder="correo@empresa.cl"
              required
            />
          </label>

          <label style={labelStyle}>
            Contraseña inicial
            <div
              style={{
                display: 'flex',
                gap: 6,
              }}
            >
              <input
                style={inputStyle}
                type="text"
                value={newPassword}
                onChange={(e) =>
                  setNewPassword(
                    e.target.value
                  )
                }
                placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="btn small secondary"
                onClick={() =>
                  setNewPassword(
                    generatePassword()
                  )
                }
                title="Generar contraseña segura"
              >
                Generar
              </button>
            </div>
          </label>

          <label style={labelStyle}>
            Rol
            <select
              style={inputStyle}
              value={newRole}
              onChange={(e) =>
                setNewRole(
                  e.target.value as Role
                )
              }
            >
              <option value="user">
                Usuario
              </option>
              <option value="admin">
                Administrador
              </option>
            </select>
          </label>

          <div>
            <button
              className="btn primary"
              disabled={busy}
            >
              + Crear usuario
            </button>
          </div>
        </form>
      </section>

      {/* ---------- MENSAJES ---------- */}

      {error && (
        <div className="alert error">
          {error}
        </div>
      )}

      {success && (
        <div style={successStyle}>
          {success}
        </div>
      )}

      {/* ---------- LISTA ---------- */}

      <section className="admin-panel">
        <h2
          style={{
            fontSize: 16,
            margin: '0 0 14px',
          }}
        >
          Usuarios registrados
          {!loading &&
            ` (${users.length})`}
        </h2>

        {loading ? (
          <div className="empty-state">
            Cargando…
          </div>
        ) : (
          <div className="catalog-list">
            {users.length === 0 && (
              <div className="empty-state">
                No hay usuarios.
              </div>
            )}

            {users.map((user) => (
              <div
                key={user.id}
                style={{
                  borderBottom:
                    '1px solid #ececeb',
                }}
              >
                <div className="catalog-row">
                  <div
                    style={{
                      display: 'grid',
                      gap: 3,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong>
                        {user.full_name ||
                          'Sin nombre'}
                        {user.is_self &&
                          ' (tú)'}
                      </strong>

                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '.04em',
                          padding: '2px 8px',
                          borderRadius: 999,
                          background:
                            user.role ===
                            'admin'
                              ? '#a7191f'
                              : '#e6e6e4',
                          color:
                            user.role ===
                            'admin'
                              ? '#fff'
                              : '#333',
                        }}
                      >
                        {user.role === 'admin'
                          ? 'ADMINISTRADOR'
                          : 'USUARIO'}
                      </span>

                      <span
                        className={`status ${
                          user.active
                            ? 'active'
                            : 'inactive'
                        }`}
                      >
                        {user.active
                          ? 'Activo'
                          : 'Inactivo'}
                      </span>
                    </div>

                    <small
                      style={{
                        color: '#6b6f73',
                      }}
                    >
                      {user.email} · Último
                      ingreso:{' '}
                      {formatDateTime(
                        user.last_sign_in_at
                      )}
                    </small>
                  </div>

                  <div className="catalog-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Editar nombre, correo y rol"
                      onClick={() =>
                        startEdit(user)
                      }
                      disabled={busy}
                    >
                      <EditIcon />
                    </button>

                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() =>
                        startPassword(user)
                      }
                      disabled={busy}
                    >
                      Contraseña
                    </button>

                    {!user.is_self && (
                      <>
                        <button
                          type="button"
                          className={`btn small ${
                            user.active
                              ? 'ghost'
                              : 'secondary'
                          }`}
                          onClick={() =>
                            void toggleActive(
                              user
                            )
                          }
                          disabled={busy}
                        >
                          {user.active
                            ? 'Desactivar'
                            : 'Activar'}
                        </button>

                        <button
                          type="button"
                          className="btn small ghost"
                          style={{
                            color: '#a7191f',
                          }}
                          onClick={() =>
                            void remove(user)
                          }
                          disabled={busy}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* ----- Editar ----- */}

                {mode.kind === 'edit' &&
                  mode.id === user.id && (
                    <div
                      style={{
                        ...gridStyle,
                        padding: '4px 0 16px',
                      }}
                    >
                      <label style={labelStyle}>
                        Nombre completo
                        <input
                          style={inputStyle}
                          value={editName}
                          onChange={(e) =>
                            setEditName(
                              e.target.value
                            )
                          }
                        />
                      </label>

                      <label style={labelStyle}>
                        Correo
                        <input
                          style={inputStyle}
                          type="email"
                          value={editEmail}
                          onChange={(e) =>
                            setEditEmail(
                              e.target.value
                            )
                          }
                        />
                      </label>

                      <label style={labelStyle}>
                        Rol
                        <select
                          style={inputStyle}
                          value={editRole}
                          disabled={
                            user.is_self
                          }
                          title={
                            user.is_self
                              ? 'No puedes cambiar tu propio rol'
                              : undefined
                          }
                          onChange={(e) =>
                            setEditRole(
                              e.target
                                .value as Role
                            )
                          }
                        >
                          <option value="user">
                            Usuario
                          </option>
                          <option value="admin">
                            Administrador
                          </option>
                        </select>
                      </label>

                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                        }}
                      >
                        <button
                          type="button"
                          className="btn small primary"
                          onClick={() =>
                            void saveEdit(user)
                          }
                          disabled={busy}
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn small ghost"
                          onClick={() =>
                            setMode({
                              kind: 'none',
                            })
                          }
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                {/* ----- Contraseña ----- */}

                {mode.kind === 'password' &&
                  mode.id === user.id && (
                    <div
                      style={{
                        ...gridStyle,
                        padding: '4px 0 16px',
                      }}
                    >
                      <label style={labelStyle}>
                        Nueva contraseña
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                          }}
                        >
                          <input
                            style={inputStyle}
                            type="text"
                            value={
                              resetPassword
                            }
                            onChange={(e) =>
                              setResetPassword(
                                e.target.value
                              )
                            }
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="btn small secondary"
                            onClick={() =>
                              setResetPassword(
                                generatePassword()
                              )
                            }
                          >
                            Generar
                          </button>
                        </div>
                      </label>

                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                        }}
                      >
                        <button
                          type="button"
                          className="btn small primary"
                          onClick={() =>
                            void savePassword(
                              user
                            )
                          }
                          disabled={busy}
                        >
                          Guardar contraseña
                        </button>
                        <button
                          type="button"
                          className="btn small ghost"
                          onClick={() =>
                            setMode({
                              kind: 'none',
                            })
                          }
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
