import { NextResponse } from 'next/server';
import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';

/*
 * ==========================================
 * CLIENTE ADMINISTRADOR DE SUPABASE
 * ==========================================
 *
 * Usa la clave de servidor (service role / secret key),
 * que permite crear, modificar y eliminar usuarios.
 *
 * IMPORTANTE:
 *
 * - SOLO se usa dentro de rutas /api (servidor).
 * - Nunca importar este archivo desde un componente.
 * - La clave va en .env.local y en Vercel como
 *   SUPABASE_SERVICE_ROLE_KEY (sin NEXT_PUBLIC_),
 *   para que nunca llegue al navegador.
 */

export class HttpError extends Error {
  status: number;

  constructor(
    status: number,
    message: string
  ) {
    super(message);
    this.status = status;
  }
}

let adminClient: SupabaseClient | null =
  null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new HttpError(
      500,
      'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor (.env.local o Vercel).'
    );
  }

  adminClient = createClient(
    url,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  return adminClient;
}

/*
 * Verifica que quien llama a la API
 * tenga una sesión válida Y sea admin
 * según la tabla profiles.
 *
 * Nunca se otorga admin como fallback:
 * ante cualquier error se rechaza.
 */
export async function requireAdmin(
  request: Request
) {
  const admin = getSupabaseAdmin();

  const authorization =
    request.headers.get('authorization');

  if (
    !authorization?.startsWith('Bearer ')
  ) {
    throw new HttpError(
      401,
      'Sesión no válida.'
    );
  }

  const token = authorization.slice(7);

  const {
    data: userData,
    error: userError,
  } = await admin.auth.getUser(token);

  if (userError || !userData.user) {
    throw new HttpError(
      401,
      'Tu sesión expiró. Vuelve a ingresar.'
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await admin
    .from('profiles')
    .select('id,role')
    .eq('id', userData.user.id)
    .maybeSingle();

  /*
   * Mensajes separados para poder
   * diagnosticar la causa exacta.
   * En todos los casos se RECHAZA.
   */
  if (profileError) {
    console.error(
      'Error al leer profiles con la clave de servidor:',
      profileError
    );

    throw new HttpError(
      502,
      `No se pudo leer tu perfil en el servidor: ${profileError.message} (código ${profileError.code ?? '—'})`
    );
  }

  if (!profile) {
    throw new HttpError(
      403,
      'Tu usuario no tiene perfil en la tabla profiles.'
    );
  }

  if (profile.role !== 'admin') {
    throw new HttpError(
      403,
      `Solo un administrador puede gestionar usuarios (tu rol en el servidor es "${profile.role}").`
    );
  }

  return {
    admin,
    currentUserId: userData.user.id,
  };
}

export function errorResponse(
  err: unknown
) {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: err.message },
      { status: err.status }
    );
  }

  console.error(
    'Error en gestión de usuarios:',
    err
  );

  return NextResponse.json(
    {
      error:
        'Ocurrió un error inesperado en el servidor.',
    },
    { status: 500 }
  );
}

/*
 * ==========================================
 * VALIDACIONES COMUNES
 * ==========================================
 */

export const MIN_PASSWORD_LENGTH = 8;

const BAN_FOREVER = '876000h'; // ~100 años

export function banDuration(
  active: boolean
) {
  return active ? 'none' : BAN_FOREVER;
}

export function cleanEmail(
  value: unknown
) {
  const email = String(value ?? '')
    .trim()
    .toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    throw new HttpError(
      400,
      'El correo no es válido.'
    );
  }

  return email;
}

export function cleanPassword(
  value: unknown
) {
  const password = String(value ?? '');

  if (
    password.length < MIN_PASSWORD_LENGTH
  ) {
    throw new HttpError(
      400,
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
    );
  }

  return password;
}

export function cleanRole(
  value: unknown
): 'admin' | 'user' {
  if (value === 'admin' || value === 'user') {
    return value;
  }

  throw new HttpError(
    400,
    'El rol no es válido.'
  );
}

export function cleanName(
  value: unknown
) {
  const name = String(value ?? '')
    .trim()
    .slice(0, 120);

  if (!name) {
    throw new HttpError(
      400,
      'El nombre es obligatorio.'
    );
  }

  return name;
}

/*
 * Traduce los errores más comunes
 * de Supabase Auth al español.
 */
export function authErrorMessage(
  error: { code?: string; message?: string }
) {
  const code = error.code ?? '';
  const message = (
    error.message ?? ''
  ).toLowerCase();

  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    message.includes('already been registered') ||
    message.includes('already registered')
  ) {
    return 'Ya existe un usuario con ese correo.';
  }

  if (
    code === 'weak_password' ||
    message.includes('password')
  ) {
    return 'La contraseña no cumple los requisitos de seguridad. Usa una más larga o con letras y números.';
  }

  if (code === 'user_not_found') {
    return 'El usuario no existe.';
  }

  return (
    error.message ||
    'Supabase rechazó la operación.'
  );
}
