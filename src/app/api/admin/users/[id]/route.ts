import { NextResponse } from 'next/server';
import type { AdminUserAttributes } from '@supabase/supabase-js';

import {
  HttpError,
  authErrorMessage,
  banDuration,
  cleanEmail,
  cleanName,
  cleanPassword,
  cleanRole,
  errorResponse,
  requireAdmin,
} from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readId(params: Params['params']) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    throw new HttpError(
      400,
      'Identificador de usuario inválido.'
    );
  }

  return id;
}

/*
 * ==========================================
 * PATCH /api/admin/users/:id
 * Edita nombre, correo, rol, contraseña
 * y activo/inactivo (solo admin).
 *
 * Reglas:
 * - El admin no puede quitarse su propio
 *   rol de admin ni desactivarse.
 *   (Así siempre queda al menos un admin.)
 * ==========================================
 */
export async function PATCH(
  request: Request,
  { params }: Params
) {
  try {
    const { admin, currentUserId } =
      await requireAdmin(request);

    const id = await readId(params);

    const body = await request
      .json()
      .catch(() => {
        throw new HttpError(
          400,
          'Solicitud inválida.'
        );
      });

    const isSelf = id === currentUserId;

    const authUpdates: AdminUserAttributes =
      {};

    const profileUpdates: {
      full_name?: string;
      email?: string;
      role?: 'admin' | 'user';
    } = {};

    if (body.full_name !== undefined) {
      profileUpdates.full_name = cleanName(
        body.full_name
      );
      authUpdates.user_metadata = {
        full_name: profileUpdates.full_name,
      };
    }

    if (body.email !== undefined) {
      const email = cleanEmail(body.email);
      authUpdates.email = email;
      authUpdates.email_confirm = true;
      profileUpdates.email = email;
    }

    if (body.role !== undefined) {
      const role = cleanRole(body.role);

      if (isSelf && role !== 'admin') {
        throw new HttpError(
          400,
          'No puedes quitarte tu propio rol de administrador.'
        );
      }

      profileUpdates.role = role;
    }

    if (body.password !== undefined) {
      authUpdates.password = cleanPassword(
        body.password
      );
    }

    if (body.active !== undefined) {
      const active = body.active === true;

      if (isSelf && !active) {
        throw new HttpError(
          400,
          'No puedes desactivar tu propio usuario.'
        );
      }

      authUpdates.ban_duration =
        banDuration(active);
    }

    const {
      data: existing,
      error: existingError,
    } = await admin.auth.admin.getUserById(id);

    if (existingError || !existing.user) {
      throw new HttpError(
        404,
        'El usuario no existe.'
      );
    }

    if (Object.keys(authUpdates).length) {
      const { error } =
        await admin.auth.admin.updateUserById(
          id,
          authUpdates
        );

      if (error) {
        throw new HttpError(
          400,
          authErrorMessage(error)
        );
      }
    }

    if (Object.keys(profileUpdates).length) {
      const {
        data: profile,
      } = await admin
        .from('profiles')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      const { error: profileError } =
        profile
          ? await admin
              .from('profiles')
              .update(profileUpdates)
              .eq('id', id)
          : await admin
              .from('profiles')
              .insert({
                id,
                email:
                  profileUpdates.email ??
                  existing.user.email ??
                  null,
                full_name:
                  profileUpdates.full_name ??
                  null,
                role:
                  profileUpdates.role ??
                  'user',
              });

      if (profileError) {
        throw new HttpError(
          502,
          'Se actualizó el acceso, pero no se pudo guardar el perfil. Intenta nuevamente.'
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/*
 * ==========================================
 * DELETE /api/admin/users/:id
 * Elimina un usuario (solo admin).
 *
 * Si el usuario tiene capacitaciones o
 * adjuntos registrados, NO se elimina
 * (se perderían o bloquearían datos):
 * en ese caso se debe desactivar.
 * ==========================================
 */
export async function DELETE(
  request: Request,
  { params }: Params
) {
  try {
    const { admin, currentUserId } =
      await requireAdmin(request);

    const id = await readId(params);

    if (id === currentUserId) {
      throw new HttpError(
        400,
        'No puedes eliminar tu propio usuario.'
      );
    }

    const {
      count: recordsCount,
      error: recordsError,
    } = await admin
      .from('training_records')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('created_by', id);

    const {
      count: attachmentsCount,
      error: attachmentsError,
    } = await admin
      .from('training_attachments')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('uploaded_by', id);

    if (recordsError || attachmentsError) {
      throw new HttpError(
        502,
        'No fue posible verificar los registros del usuario.'
      );
    }

    if (
      (recordsCount ?? 0) > 0 ||
      (attachmentsCount ?? 0) > 0
    ) {
      throw new HttpError(
        409,
        `Este usuario tiene ${recordsCount ?? 0} capacitación(es) y ${attachmentsCount ?? 0} adjunto(s) registrados, por lo que no se puede eliminar. Desactívalo para impedir su acceso.`
      );
    }

    const { error } =
      await admin.auth.admin.deleteUser(id);

    if (error) {
      throw new HttpError(
        400,
        authErrorMessage(error)
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
