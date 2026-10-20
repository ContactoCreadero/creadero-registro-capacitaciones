import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

import {
  HttpError,
  authErrorMessage,
  cleanEmail,
  cleanName,
  cleanPassword,
  cleanRole,
  errorResponse,
  requireAdmin,
} from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
};

/*
 * ==========================================
 * GET /api/admin/users
 * Lista todos los usuarios (solo admin).
 * ==========================================
 */
export async function GET(
  request: Request
) {
  try {
    const { admin, currentUserId } =
      await requireAdmin(request);

    const authUsers: User[] = [];
    const perPage = 200;

    for (let page = 1; page <= 50; page++) {
      const { data, error } =
        await admin.auth.admin.listUsers({
          page,
          perPage,
        });

      if (error) {
        throw new HttpError(
          502,
          'No fue posible obtener la lista de usuarios.'
        );
      }

      authUsers.push(...data.users);

      if (data.users.length < perPage) {
        break;
      }
    }

    const {
      data: profiles,
      error: profilesError,
    } = await admin
      .from('profiles')
      .select('id,email,full_name,role');

    if (profilesError) {
      throw new HttpError(
        502,
        'No fue posible leer los perfiles.'
      );
    }

    const byId = new Map(
      ((profiles ?? []) as ProfileRow[]).map(
        (p) => [p.id, p]
      )
    );

    const now = Date.now();

    const users = authUsers
      .map((u) => {
        const profile = byId.get(u.id);

        const bannedUntil = u.banned_until
          ? new Date(u.banned_until).getTime()
          : 0;

        return {
          id: u.id,
          email:
            u.email ?? profile?.email ?? null,
          full_name:
            profile?.full_name ?? null,
          role:
            profile?.role === 'admin'
              ? 'admin'
              : 'user',
          active: !(bannedUntil > now),
          last_sign_in_at:
            u.last_sign_in_at ?? null,
          created_at: u.created_at,
          is_self: u.id === currentUserId,
        };
      })
      .sort((a, b) =>
        (a.full_name || a.email || '').localeCompare(
          b.full_name || b.email || '',
          'es'
        )
      );

    return NextResponse.json({ users });
  } catch (err) {
    return errorResponse(err);
  }
}

/*
 * ==========================================
 * POST /api/admin/users
 * Crea un usuario nuevo (solo admin).
 * ==========================================
 */
export async function POST(
  request: Request
) {
  try {
    const { admin } =
      await requireAdmin(request);

    const body = await request
      .json()
      .catch(() => {
        throw new HttpError(
          400,
          'Solicitud inválida.'
        );
      });

    const fullName = cleanName(
      body.full_name
    );
    const email = cleanEmail(body.email);
    const password = cleanPassword(
      body.password
    );
    const role = cleanRole(body.role);

    const { data, error } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

    if (error || !data.user) {
      throw new HttpError(
        400,
        authErrorMessage(error ?? {})
      );
    }

    /*
     * El trigger handle_new_user ya creó
     * el perfil con rol "user". Aquí se
     * guardan el nombre y el rol elegidos.
     */
    const { error: profileError } =
      await admin
        .from('profiles')
        .upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          role,
        });

    if (profileError) {
      // Revertir para no dejar un usuario a medias.
      await admin.auth.admin.deleteUser(
        data.user.id
      );

      throw new HttpError(
        502,
        'No fue posible guardar el perfil del usuario. No se creó el usuario.'
      );
    }

    return NextResponse.json({
      ok: true,
      id: data.user.id,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
