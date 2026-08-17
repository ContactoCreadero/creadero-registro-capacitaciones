'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

import {
  escapeHtml,
  formatDate,
  formatDuration,
  relationName,
} from '@/lib/format';

import type {
  Role,
  TrainingRecord,
} from '@/lib/types';

import {
  AttachmentIcon,
  EditIcon,
  PrintIcon,
  TrashIcon,
} from './Icons';

type Props = {
  role: Role;
  onEdit: (id: string) => void;
  onNew: () => void;
};

type Attachment = {
  id: string;
  training_record_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

export default function Records({
  role,
  onEdit,
  onNew,
}: Props) {
  const [records, setRecords] =
    useState<TrainingRecord[]>([]);

  const [attachments, setAttachments] =
    useState<Attachment[]>([]);

  const [selected, setSelected] =
    useState<Set<string>>(new Set());

  const [search, setSearch] =
    useState('');

  const [dateFrom, setDateFrom] =
    useState('');

  const [dateTo, setDateTo] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [
    attachmentsRecordId,
    setAttachmentsRecordId,
  ] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');

    const [
      recordsResponse,
      attachmentsResponse,
    ] = await Promise.all([
      supabase
        .from('training_records')
        .select(
          '*, facilitators(name)'
        )
        .order(
          'training_date',
          {
            ascending: false,
          }
        )
        .order(
          'created_at',
          {
            ascending: false,
          }
        ),

      supabase
        .from(
          'training_attachments'
        )
        .select(
          'id,training_record_id,file_name,storage_path,mime_type,file_size,created_at'
        )
        .order(
          'created_at',
          {
            ascending: true,
          }
        ),
    ]);

    if (recordsResponse.error) {
      setError(
        recordsResponse.error.message
      );
    }

    if (attachmentsResponse.error) {
      setError(
        `No fue posible cargar los adjuntos: ${attachmentsResponse.error.message}`
      );
    }

    setRecords(
      (recordsResponse.data ??
        []) as TrainingRecord[]
    );

    setAttachments(
      (attachmentsResponse.data ??
        []) as Attachment[]
    );

    setSelected(
      new Set()
    );

    setLoading(false);
  }

  const filtered =
    useMemo(() => {
      const q = search
        .trim()
        .toLocaleLowerCase(
          'es'
        );

      return records.filter(
        (r) => {
          if (
            dateFrom &&
            r.training_date <
              dateFrom
          ) {
            return false;
          }

          if (
            dateTo &&
            r.training_date >
              dateTo
          ) {
            return false;
          }

          if (!q) {
            return true;
          }

          const haystack = [
            r.activity_name,
            r.site,
            r.client_name,
            relationName(
              r.facilitators
            ),
          ]
            .join(' ')
            .toLocaleLowerCase(
              'es'
            );

          return haystack.includes(
            q
          );
        }
      );
    }, [
      records,
      search,
      dateFrom,
      dateTo,
    ]);

  const selectedRecords =
    filtered.filter((r) =>
      selected.has(r.id)
    );

  const allVisibleSelected =
    filtered.length > 0 &&
    filtered.every((r) =>
      selected.has(r.id)
    );

  function getAttachments(
    recordId: string
  ) {
    return attachments.filter(
      (attachment) =>
        attachment.training_record_id ===
        recordId
    );
  }

  function toggle(
    id: string
  ) {
    setSelected(
      (prev) => {
        const next =
          new Set(prev);

        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        return next;
      }
    );
  }

  function toggleAll() {
    setSelected(
      (prev) => {
        const next =
          new Set(prev);

        if (
          allVisibleSelected
        ) {
          filtered.forEach(
            (r) =>
              next.delete(r.id)
          );
        } else {
          filtered.forEach(
            (r) =>
              next.add(r.id)
          );
        }

        return next;
      }
    );
  }

  async function openAttachment(
    attachment: Attachment
  ) {
    const tab =
      window.open(
        '',
        '_blank'
      );

    const {
      data,
      error,
    } = await supabase.storage
      .from(
        'training-evidence'
      )
      .createSignedUrl(
        attachment.storage_path,
        60
      );

    if (
      error ||
      !data?.signedUrl
    ) {
      tab?.close();

      alert(
        'No fue posible abrir el adjunto.'
      );

      return;
    }

    if (tab) {
      tab.opener = null;

      tab.location.href =
        data.signedUrl;
    } else {
      window.location.href =
        data.signedUrl;
    }
  }

  async function deleteAttachment(
    attachment: Attachment
  ) {
    if (
      role !== 'admin'
    ) {
      return;
    }

    const ok =
      confirm(
        `¿Eliminar el adjunto "${attachment.file_name}"?`
      );

    if (!ok) {
      return;
    }

    /*
     * Primero eliminamos el registro
     * de la base de datos.
     */
    const {
      error:
        deleteRowError,
    } = await supabase
      .from(
        'training_attachments'
      )
      .delete()
      .eq(
        'id',
        attachment.id
      );

    if (
      deleteRowError
    ) {
      alert(
        `No fue posible eliminar el adjunto: ${deleteRowError.message}`
      );

      return;
    }

    /*
     * Después retiramos el archivo
     * físico de Storage.
     */
    const {
      error:
        storageError,
    } = await supabase.storage
      .from(
        'training-evidence'
      )
      .remove([
        attachment.storage_path,
      ]);

    if (
      storageError
    ) {
      console.warn(
        'El registro del adjunto fue eliminado, pero Storage informó:',
        storageError.message
      );
    }

    setAttachments(
      (prev) =>
        prev.filter(
          (a) =>
            a.id !==
            attachment.id
        )
    );
  }

  async function deleteSelected() {
    if (
      role !== 'admin'
    ) {
      return;
    }

    const ids =
      Array.from(selected);

    if (!ids.length) {
      return;
    }

    const ok =
      confirm(
        `¿Eliminar ${ids.length} registro(s)? Esta acción no se puede deshacer.`
      );

    if (!ok) {
      return;
    }

    /*
     * Guardamos las rutas antes
     * de borrar los registros.
     */
    const attachmentPaths =
      attachments
        .filter((a) =>
          ids.includes(
            a.training_record_id
          )
        )
        .map(
          (a) =>
            a.storage_path
        );

    /*
     * training_attachments tiene
     * ON DELETE CASCADE.
     */
    const {
      error:
        deleteError,
    } = await supabase
      .from(
        'training_records'
      )
      .delete()
      .in(
        'id',
        ids
      );

    if (deleteError) {
      alert(
        `No fue posible eliminar: ${deleteError.message}`
      );

      return;
    }

    /*
     * Eliminamos también los
     * archivos físicos.
     */
    if (
      attachmentPaths.length >
      0
    ) {
      const {
        error:
          storageError,
      } = await supabase.storage
        .from(
          'training-evidence'
        )
        .remove(
          attachmentPaths
        );

      if (
        storageError
      ) {
        console.warn(
          'Los registros se eliminaron, pero Storage informó:',
          storageError.message
        );
      }
    }

    setAttachmentsRecordId(
      null
    );

    await load();
  }

  function printSelected() {
    if (
      !selectedRecords.length
    ) {
      return;
    }

    const logo =
      `${window.location.origin}/logo.png`;

    const cards =
      selectedRecords
        .map(
          (r) => `
        <section class="sheet">

          <header>
            <img
              src="${logo}"
              alt="Creadero"
            >

            <div>
              <small>
                REGISTRO
              </small>

              <h1>
                Capacitación realizada
              </h1>
            </div>
          </header>

          <div class="redline"></div>

          <div class="grid">

            ${printField(
              'CLIENTE',
              r.client_name
            )}

            ${printField(
              'OBRA / FAENA / LUGAR',
              r.site
            )}

            ${printField(
              'FECHA',
              formatDate(
                r.training_date
              )
            )}

            ${printField(
              'RELATOR / FACILITADOR',
              relationName(
                r.facilitators
              )
            )}

            ${printField(
              'HORA INICIO',
              r.start_time.slice(
                0,
                5
              )
            )}

            ${printField(
              'HORA TÉRMINO',
              r.end_time.slice(
                0,
                5
              )
            )}

            ${printField(
              'DURACIÓN',
              formatDuration(
                r.duration_minutes
              )
            )}

            ${printField(
              'N° PARTICIPANTES',
              r.participants_count ??
                '—'
            )}

            <div class="field wide">
              <span>
                NOMBRE DE CHARLA / CURSO / ACTIVIDAD
              </span>

              <strong>
                ${escapeHtml(
                  r.activity_name
                )}
              </strong>
            </div>

            <div class="field wide">
              <span>
                OBSERVACIONES
              </span>

              <strong>
                ${escapeHtml(
                  r.observations ||
                    '—'
                )}
              </strong>
            </div>

          </div>

          <footer>
            Registro generado desde
            la plataforma Creadero ·
            ${escapeHtml(
              new Date().toLocaleString(
                'es-CL'
              )
            )}
          </footer>

        </section>
      `
        )
        .join('');

    const w =
      window.open(
        '',
        '_blank',
        'width=1000,height=800'
      );

    if (!w) {
      return;
    }

    w.document.write(`
      <!doctype html>

      <html>
        <head>
          <meta charset="utf-8">

          <title>
            Registros de capacitación
          </title>

          <style>

            @page {
              size: A4;
              margin: 14mm;
            }

            * {
              box-sizing:
                border-box;
            }

            body {
              font-family:
                Arial,
                Helvetica,
                sans-serif;

              color:
                #202428;

              margin: 0;

              background:
                #fff;
            }

            .sheet {
              min-height:
                260mm;

              page-break-after:
                always;

              padding:
                8mm 4mm;
            }

            .sheet:last-child {
              page-break-after:
                auto;
            }

            header {
              display:
                flex;

              align-items:
                flex-end;

              justify-content:
                space-between;

              gap:
                24px;
            }

            header img {
              width:
                210px;

              height:
                auto;
            }

            header div {
              text-align:
                right;
            }

            header small {
              font-size:
                10px;

              letter-spacing:
                .14em;

              color:
                #a7191f;

              font-weight:
                700;
            }

            h1 {
              margin:
                4px 0 0;

              font-size:
                24px;

              font-weight:
                600;
            }

            .redline {
              height:
                4px;

              background:
                #a7191f;

              margin:
                18px 0 24px;
            }

            .grid {
              display:
                grid;

              grid-template-columns:
                1fr 1fr;

              gap:
                12px;
            }

            .field {
              border:
                1px solid
                #d9d9d7;

              border-radius:
                8px;

              padding:
                14px;

              min-height:
                66px;
            }

            .field.wide {
              grid-column:
                1 / -1;
            }

            .field span {
              display:
                block;

              font-size:
                9px;

              letter-spacing:
                .08em;

              color:
                #6b6f73;

              font-weight:
                700;

              margin-bottom:
                7px;
            }

            .field strong {
              font-size:
                13px;

              line-height:
                1.35;

              font-weight:
                600;
            }

            footer {
              margin-top:
                30px;

              padding-top:
                12px;

              border-top:
                1px solid
                #ddd;

              font-size:
                9px;

              color:
                #777;
            }

            @media print {
              body {
                print-color-adjust:
                  exact;

                -webkit-print-color-adjust:
                  exact;
              }
            }

          </style>
        </head>

        <body>
          ${cards}

          <script>
            window.onload = () =>
              setTimeout(
                () =>
                  window.print(),
                250
              );
          <\/script>
        </body>
      </html>
    `);

    w.document.close();
  }

  function printOne(
    r: TrainingRecord
  ) {
    const logo =
      `${window.location.origin}/logo.png`;

    const w =
      window.open(
        '',
        '_blank',
        'width=900,height=800'
      );

    if (!w) {
      return;
    }

    w.document.write(`
      <!doctype html>

      <html>
        <head>
          <meta charset="utf-8">

          <title>
            Registro de capacitación
          </title>

          <style>

            @page {
              size: A4;
              margin: 14mm;
            }

            * {
              box-sizing:
                border-box;
            }

            body {
              font-family:
                Arial,
                Helvetica,
                sans-serif;

              color:
                #202428;

              margin: 0;
            }

            .sheet {
              padding:
                8mm 4mm;
            }

            header {
              display:
                flex;

              align-items:
                flex-end;

              justify-content:
                space-between;

              gap:
                24px;
            }

            header img {
              width:
                210px;
            }

            header div {
              text-align:
                right;
            }

            header small {
              font-size:
                10px;

              letter-spacing:
                .14em;

              color:
                #a7191f;

              font-weight:
                700;
            }

            h1 {
              margin:
                4px 0 0;

              font-size:
                24px;

              font-weight:
                600;
            }

            .redline {
              height:
                4px;

              background:
                #a7191f;

              margin:
                18px 0 24px;
            }

            .grid {
              display:
                grid;

              grid-template-columns:
                1fr 1fr;

              gap:
                12px;
            }

            .field {
              border:
                1px solid
                #d9d9d7;

              border-radius:
                8px;

              padding:
                14px;

              min-height:
                66px;
            }

            .wide {
              grid-column:
                1 / -1;
            }

            .field span {
              display:
                block;

              font-size:
                9px;

              letter-spacing:
                .08em;

              color:
                #6b6f73;

              font-weight:
                700;

              margin-bottom:
                7px;
            }

            .field strong {
              font-size:
                13px;

              line-height:
                1.35;

              font-weight:
                600;
            }

            footer {
              margin-top:
                30px;

              padding-top:
                12px;

              border-top:
                1px solid
                #ddd;

              font-size:
                9px;

              color:
                #777;
            }

            @media print {
              body {
                print-color-adjust:
                  exact;

                -webkit-print-color-adjust:
                  exact;
              }
            }

          </style>
        </head>

        <body>

          <section class="sheet">

            <header>

              <img
                src="${logo}"
                alt="Creadero"
              >

              <div>
                <small>
                  REGISTRO
                </small>

                <h1>
                  Capacitación realizada
                </h1>
              </div>

            </header>

            <div class="redline"></div>

            <div class="grid">

              ${printField(
                'CLIENTE',
                r.client_name
              )}

              ${printField(
                'OBRA / FAENA / LUGAR',
                r.site
              )}

              ${printField(
                'FECHA',
                formatDate(
                  r.training_date
                )
              )}

              ${printField(
                'RELATOR / FACILITADOR',
                relationName(
                  r.facilitators
                )
              )}

              ${printField(
                'HORA INICIO',
                r.start_time.slice(
                  0,
                  5
                )
              )}

              ${printField(
                'HORA TÉRMINO',
                r.end_time.slice(
                  0,
                  5
                )
              )}

              ${printField(
                'DURACIÓN',
                formatDuration(
                  r.duration_minutes
                )
              )}

              ${printField(
                'N° PARTICIPANTES',
                r.participants_count ??
                  '—'
              )}

              <div class="field wide">
                <span>
                  NOMBRE DE CHARLA / CURSO / ACTIVIDAD
                </span>

                <strong>
                  ${escapeHtml(
                    r.activity_name
                  )}
                </strong>
              </div>

              <div class="field wide">
                <span>
                  OBSERVACIONES
                </span>

                <strong>
                  ${escapeHtml(
                    r.observations ||
                      '—'
                  )}
                </strong>
              </div>

            </div>

            <footer>
              Registro generado desde
              la plataforma Creadero ·
              ${escapeHtml(
                new Date().toLocaleString(
                  'es-CL'
                )
              )}
            </footer>

          </section>

          <script>
            window.onload = () =>
              setTimeout(
                () =>
                  window.print(),
                250
              );
          <\/script>

        </body>
      </html>
    `);

    w.document.close();
  }

  const modalAttachments =
    attachmentsRecordId
      ? getAttachments(
          attachmentsRecordId
        )
      : [];

  return (
    <div className="page-stack">

      <div className="page-heading">

        <div>
          <span className="eyebrow">
            HISTORIAL
          </span>

          <h1>
            Registros realizados
          </h1>

          <p>
            Selecciona uno o varios
            registros para imprimir.

            {role === 'admin'
              ? ' Como administrador también puedes editarlos y eliminarlos.'
              : ''}
          </p>
        </div>

        <button
          className="btn primary"
          onClick={onNew}
        >
          + Nueva capacitación
        </button>

      </div>

      <section className="records-panel">

        <div className="toolbar">

          <input
            className="search-input"
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            placeholder="Buscar cliente, lugar, actividad o relator…"
          />

          <div className="date-filter">

            <span>
              Desde
            </span>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) =>
                setDateFrom(
                  e.target.value
                )
              }
            />

          </div>

          <div className="date-filter">

            <span>
              Hasta
            </span>

            <input
              type="date"
              value={dateTo}
              onChange={(e) =>
                setDateTo(
                  e.target.value
                )
              }
            />

          </div>

        </div>

        <div className="bulkbar">

          <label className="check-label">

            <input
              type="checkbox"
              checked={
                allVisibleSelected
              }
              onChange={
                toggleAll
              }
            />

            Seleccionar visibles

          </label>

          <span>
            {selected.size}{' '}
            seleccionado(s)
          </span>

          <div className="bulk-actions">

            <button
              className="btn small secondary"
              disabled={
                !selectedRecords.length
              }
              onClick={
                printSelected
              }
            >
              <PrintIcon />

              Imprimir seleccionados
            </button>

            {role === 'admin' && (
              <button
                className="btn small danger"
                disabled={
                  !selected.size
                }
                onClick={() =>
                  void deleteSelected()
                }
              >
                <TrashIcon />

                Eliminar
              </button>
            )}

          </div>

        </div>

        {error && (
          <div className="alert error">
            {error}
          </div>
        )}

        {loading ? (

          <div className="empty-state">
            Cargando registros…
          </div>

        ) : filtered.length ===
          0 ? (

          <div className="empty-state">
            No hay registros que
            coincidan con los filtros.
          </div>

        ) : (

          <div className="table-wrap">

            <table className="records-table">

              <thead>
                <tr>
                  <th></th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Actividad</th>
                  <th>Lugar</th>
                  <th>Relator</th>
                  <th>Horario</th>
                  <th>Duración</th>
                  <th>Adjuntos</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>

                {filtered.map(
                  (r) => {
                    const recordAttachments =
                      getAttachments(
                        r.id
                      );

                    return (
                      <tr
                        key={
                          r.id
                        }
                        className={
                          selected.has(
                            r.id
                          )
                            ? 'selected-row'
                            : ''
                        }
                      >

                        <td>
                          <input
                            type="checkbox"
                            checked={
                              selected.has(
                                r.id
                              )
                            }
                            onChange={() =>
                              toggle(
                                r.id
                              )
                            }
                          />
                        </td>

                        <td className="nowrap">
                          {formatDate(
                            r.training_date
                          )}
                        </td>

                        <td>
                          <strong>
                            {
                              r.client_name
                            }
                          </strong>
                        </td>

                        <td>
                          {
                            r.activity_name
                          }
                        </td>

                        <td>
                          {r.site}
                        </td>

                        <td>
                          {relationName(
                            r.facilitators
                          )}
                        </td>

                        <td className="nowrap">
                          {r.start_time.slice(
                            0,
                            5
                          )}
                          –
                          {r.end_time.slice(
                            0,
                            5
                          )}
                        </td>

                        <td className="nowrap">
                          {formatDuration(
                            r.duration_minutes
                          )}
                        </td>

                        <td className="nowrap">

                          {recordAttachments.length >
                          0 ? (

                            <button
                              type="button"
                              className="btn small secondary"
                              onClick={() =>
                                setAttachmentsRecordId(
                                  r.id
                                )
                              }
                            >
                              <AttachmentIcon />

                              {
                                recordAttachments.length
                              }{' '}

                              {recordAttachments.length ===
                              1
                                ? 'adjunto'
                                : 'adjuntos'}
                            </button>

                          ) : (

                            <span
                              style={{
                                color:
                                  '#888',
                                fontSize:
                                  '12px',
                              }}
                            >
                              Sin adjuntos
                            </span>

                          )}

                        </td>

                        <td>

                          <div className="row-actions">

                            {role ===
                              'admin' && (
                              <button
                                title="Editar"
                                className="icon-btn"
                                onClick={() =>
                                  onEdit(
                                    r.id
                                  )
                                }
                              >
                                <EditIcon />
                              </button>
                            )}

                            <button
                              title="Imprimir"
                              className="icon-btn"
                              onClick={() =>
                                printOne(
                                  r
                                )
                              }
                            >
                              <PrintIcon />
                            </button>

                          </div>

                        </td>

                      </tr>
                    );
                  }
                )}

              </tbody>

            </table>

          </div>

        )}

      </section>

      {/* ========================================
          VENTANA DE ADJUNTOS
      ======================================== */}

      {attachmentsRecordId && (

        <div
          style={{
            position:
              'fixed',

            inset: 0,

            background:
              'rgba(0,0,0,.42)',

            display:
              'flex',

            alignItems:
              'center',

            justifyContent:
              'center',

            padding:
              '20px',

            zIndex:
              9999,
          }}
          onClick={() =>
            setAttachmentsRecordId(
              null
            )
          }
        >

          <div
            style={{
              width:
                'min(680px, 100%)',

              maxHeight:
                '80vh',

              overflowY:
                'auto',

              background:
                '#fff',

              borderRadius:
                '14px',

              boxShadow:
                '0 20px 60px rgba(0,0,0,.25)',

              padding:
                '22px',
            }}
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div
              style={{
                display:
                  'flex',

                justifyContent:
                  'space-between',

                alignItems:
                  'center',

                gap:
                  '16px',

                marginBottom:
                  '18px',
              }}
            >

              <div>

                <span className="eyebrow">
                  RESPALDOS
                </span>

                <h2
                  style={{
                    margin:
                      '4px 0 0',
                  }}
                >
                  Adjuntos
                </h2>

              </div>

              <button
                type="button"
                className="btn small ghost"
                onClick={() =>
                  setAttachmentsRecordId(
                    null
                  )
                }
              >
                Cerrar
              </button>

            </div>

            {modalAttachments.length ===
            0 ? (

              <div className="empty-state">
                Este registro no tiene
                adjuntos.
              </div>

            ) : (

              <div
                style={{
                  display:
                    'grid',

                  gap:
                    '10px',
                }}
              >

                {modalAttachments.map(
                  (
                    attachment,
                    index
                  ) => (

                    <div
                      key={
                        attachment.id
                      }
                      style={{
                        display:
                          'flex',

                        alignItems:
                          'center',

                        justifyContent:
                          'space-between',

                        gap:
                          '16px',

                        border:
                          '1px solid #ddd',

                        borderRadius:
                          '10px',

                        padding:
                          '12px 14px',
                      }}
                    >

                      <div
                        style={{
                          minWidth:
                            0,
                        }}
                      >

                        <div
                          style={{
                            fontSize:
                              '13px',

                            fontWeight:
                              600,

                            overflow:
                              'hidden',

                            textOverflow:
                              'ellipsis',

                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {index +
                            1}
                          .{' '}
                          {
                            attachment.file_name
                          }
                        </div>

                        {attachment.file_size !=
                          null && (

                          <small className="helper">
                            {formatBytes(
                              attachment.file_size
                            )}
                          </small>

                        )}

                      </div>

                      <div
                        style={{
                          display:
                            'flex',

                          gap:
                            '8px',

                          flexShrink:
                            0,
                        }}
                      >

                        <button
                          type="button"
                          className="btn small secondary"
                          onClick={() =>
                            void openAttachment(
                              attachment
                            )
                          }
                        >
                          Abrir
                        </button>

                        {role ===
                          'admin' && (

                          <button
                            type="button"
                            className="btn small danger"
                            onClick={() =>
                              void deleteAttachment(
                                attachment
                              )
                            }
                          >
                            Eliminar
                          </button>

                        )}

                      </div>

                    </div>

                  )
                )}

              </div>

            )}

          </div>

        </div>

      )}

    </div>
  );
}

function printField(
  label: string,
  value: unknown
) {
  return `
    <div class="field">

      <span>
        ${escapeHtml(
          label
        )}
      </span>

      <strong>
        ${escapeHtml(
          value
        )}
      </strong>

    </div>
  `;
}

function formatBytes(
  bytes: number
) {
  if (
    bytes < 1024
  ) {
    return `${bytes} B`;
  }

  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}