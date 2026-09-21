import { NextResponse } from 'next/server';

type AuthUser = {
  id: string;
  email?: string | null;
};

type TrainingRecord = {
  id: string;
  client_name: string;
  site: string;
  training_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  activity_name: string;
  participants_count: number | null;
  observations: string | null;
  created_by: string;
  facilitators?:
    | { name: string }
    | { name: string }[]
    | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function facilitatorName(
  value: TrainingRecord['facilitators']
) {
  if (!value) return '—';

  if (Array.isArray(value)) {
    return value[0]?.name ?? '—';
  }

  return value.name ?? '—';
}

function formatDate(value: string) {
  const [year, month, day] =
    value.split('-');

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes)) {
    return '—';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(
    minutes / 60
  );
  const remainder = minutes % 60;

  if (!remainder) {
    return `${hours} h`;
  }

  return `${hours} h ${remainder} min`;
}

export async function POST(
  request: Request
) {
  const resendApiKey =
    process.env.RESEND_API_KEY;

  const notificationEmail =
    process.env.TRAINING_NOTIFICATION_EMAIL;

  const fromEmail =
    process.env.RESEND_FROM_EMAIL;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !resendApiKey ||
    !notificationEmail ||
    !fromEmail ||
    !supabaseUrl ||
    !supabaseAnonKey
  ) {
    return NextResponse.json(
      {
        error:
          'Falta configurar el servicio de correo en Vercel.',
      },
      { status: 500 }
    );
  }

  const authorization =
    request.headers.get(
      'authorization'
    );

  if (
    !authorization?.startsWith(
      'Bearer '
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Sesión no válida para enviar la notificación.',
      },
      { status: 401 }
    );
  }

  let body: {
    recordId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          'Solicitud de notificación inválida.',
      },
      { status: 400 }
    );
  }

  if (!body.recordId) {
    return NextResponse.json(
      {
        error:
          'Falta el identificador del registro.',
      },
      { status: 400 }
    );
  }

  const commonHeaders = {
    apikey: supabaseAnonKey,
    Authorization: authorization,
  };

  const userResponse = await fetch(
    `${supabaseUrl}/auth/v1/user`,
    {
      headers: commonHeaders,
      cache: 'no-store',
    }
  );

  if (!userResponse.ok) {
    return NextResponse.json(
      {
        error:
          'No fue posible validar el usuario autenticado.',
      },
      { status: 401 }
    );
  }

  const user =
    (await userResponse.json()) as AuthUser;

  const recordParams =
    new URLSearchParams();

  recordParams.set(
    'id',
    `eq.${body.recordId}`
  );

  recordParams.set(
    'select',
    [
      'id',
      'client_name',
      'site',
      'training_date',
      'start_time',
      'end_time',
      'duration_minutes',
      'activity_name',
      'participants_count',
      'observations',
      'created_by',
      'facilitators(name)',
    ].join(',')
  );

  const recordResponse = await fetch(
    `${supabaseUrl}/rest/v1/training_records?${recordParams.toString()}`,
    {
      headers: commonHeaders,
      cache: 'no-store',
    }
  );

  if (!recordResponse.ok) {
    return NextResponse.json(
      {
        error:
          'No fue posible recuperar el registro guardado.',
      },
      { status: 502 }
    );
  }

  const records =
    (await recordResponse.json()) as TrainingRecord[];

  const record = records[0];

  if (!record) {
    return NextResponse.json(
      {
        error:
          'No se encontró el registro recién creado.',
      },
      { status: 404 }
    );
  }

  if (
    record.created_by !== user.id
  ) {
    return NextResponse.json(
      {
        error:
          'El usuario no puede notificar este registro.',
      },
      { status: 403 }
    );
  }

  const attachmentParams =
    new URLSearchParams();

  attachmentParams.set(
    'training_record_id',
    `eq.${record.id}`
  );

  attachmentParams.set(
    'select',
    'id'
  );

  const attachmentsResponse =
    await fetch(
      `${supabaseUrl}/rest/v1/training_attachments?${attachmentParams.toString()}`,
      {
        headers: commonHeaders,
        cache: 'no-store',
      }
    );

  let attachmentCount = 0;

  if (attachmentsResponse.ok) {
    const rows =
      (await attachmentsResponse.json()) as {
        id: string;
      }[];

    attachmentCount = rows.length;
  }

  const relator =
    facilitatorName(
      record.facilitators
    );

  const recipients =
    notificationEmail
      .split(',')
      .map((email: string) => email.trim())
      .filter(Boolean);

  if (!recipients.length) {
    return NextResponse.json(
      {
        error:
          'No hay un correo destinatario configurado.',
      },
      { status: 500 }
    );
  }

  const subject =
    `Nueva capacitación registrada · ${record.client_name}`;

  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f5f4f2;font-family:Arial,Helvetica,sans-serif;color:#202428;">
        <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
          <div style="background:#ffffff;border:1px solid #e1e1df;border-radius:12px;overflow:hidden;">
            <div style="height:5px;background:#a7191f;"></div>

            <div style="padding:26px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:#a7191f;margin-bottom:8px;">
                CREADERO · REGISTRO DE CAPACITACIONES
              </div>

              <h1 style="font-size:22px;margin:0 0 8px;line-height:1.25;">
                Nueva capacitación registrada
              </h1>

              <p style="margin:0 0 24px;color:#666;font-size:14px;">
                Se ingresó un nuevo registro en la plataforma.
              </p>

              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                ${emailRow('Cliente', record.client_name)}
                ${emailRow('Obra / Faena / Lugar', record.site)}
                ${emailRow('Fecha', formatDate(record.training_date))}
                ${emailRow('Relator / Facilitador', relator)}
                ${emailRow('Horario', `${record.start_time.slice(0, 5)} – ${record.end_time.slice(0, 5)}`)}
                ${emailRow('Duración', formatDuration(record.duration_minutes))}
                ${emailRow('Actividad', record.activity_name)}
                ${emailRow('N° participantes', record.participants_count ?? '—')}
                ${emailRow('Adjuntos', attachmentCount)}
                ${emailRow('Observaciones', record.observations || '—')}
                ${emailRow('Registrado por', user.email || user.id)}
              </table>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const emailResponse = await fetch(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${resendApiKey}`,
        'Content-Type':
          'application/json',
        'Idempotency-Key':
          `training-created/${record.id}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject,
        html,
      }),
      cache: 'no-store',
    }
  );

  const emailResult =
    await emailResponse.json().catch(
      () => null
    );

  if (!emailResponse.ok) {
    const detail =
      emailResult &&
      typeof emailResult ===
        'object' &&
      'message' in emailResult
        ? String(
            emailResult.message
          )
        : 'Resend rechazó el envío.';

    return NextResponse.json(
      { error: detail },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    emailId:
      emailResult &&
      typeof emailResult ===
        'object' &&
      'id' in emailResult
        ? emailResult.id
        : null,
  });
}

function emailRow(
  label: string,
  value: unknown
) {
  return `
    <tr>
      <td style="width:34%;padding:9px 10px;border-top:1px solid #ececeb;color:#6b6f73;font-size:12px;font-weight:700;vertical-align:top;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:9px 10px;border-top:1px solid #ececeb;font-size:13px;vertical-align:top;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
}
