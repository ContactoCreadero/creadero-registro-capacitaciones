'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';

import {
  calculateDuration,
  formatDuration,
} from '@/lib/format';

import type {
  CatalogItem,
  TrainingRecord,
} from '@/lib/types';

type Props = {
  recordId?: string | null;
  userId: string;
  onSaved: () => void;
  onCancel: () => void;
};

type ExistingAttachment = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

type FileSlot = {
  id: string;
  file: File | null;
};

const MAX_FILE_SIZE =
  10 * 1024 * 1024;

const initialForm = {
  client_name: '',
  site: '',
  training_date:
    new Date()
      .toISOString()
      .slice(0, 10),

  facilitator_id: '',

  start_time: '08:00',
  end_time: '08:30',

  activity_name: '',

  participants_count: '',

  observations: '',
};

function createFileSlot(): FileSlot {
  return {
    id: crypto.randomUUID(),
    file: null,
  };
}

export default function TrainingForm({
  recordId,
  userId,
  onSaved,
  onCancel,
}: Props) {
  const [
    facilitators,
    setFacilitators,
  ] = useState<CatalogItem[]>([]);

  const [
    form,
    setForm,
  ] = useState(initialForm);

  const [
    existingAttachments,
    setExistingAttachments,
  ] =
    useState<
      ExistingAttachment[]
    >([]);

  const [
    fileSlots,
    setFileSlots,
  ] = useState<FileSlot[]>(
    () => [
      createFileSlot(),
    ]
  );

  /*
   * Si una capacitación nueva
   * alcanza a guardarse pero
   * algún adjunto falla,
   * conservamos el ID para
   * poder reintentar.
   */
  const [
    persistedId,
    setPersistedId,
  ] = useState<
    string | null
  >(recordId ?? null);

  const [
    loading,
    setLoading,
  ] = useState(
    Boolean(recordId)
  );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    success,
    setSuccess,
  ] = useState('');

  const duration =
    useMemo(
      () =>
        calculateDuration(
          form.start_time,
          form.end_time
        ),
      [
        form.start_time,
        form.end_time,
      ]
    );

  useEffect(() => {
    void load();
  }, [recordId]);

  async function load() {
    setLoading(true);
    setError('');
    setSuccess('');

    /*
     * CARGAR RELATORES
     */
    const {
      data:
        facilitatorsData,

      error:
        facilitatorsError,
    } =
      await supabase
        .from(
          'facilitators'
        )
        .select(
          'id,name,active'
        )
        .order('name');

    if (
      facilitatorsError
    ) {
      setError(
        'No fue posible cargar los relatores/facilitadores.'
      );
    }

    setFacilitators(
      (
        facilitatorsData ??
        []
      ) as CatalogItem[]
    );

    /*
     * EDICIÓN DE REGISTRO
     */
    if (recordId) {
      const [
        recordResponse,
        attachmentsResponse,
      ] =
        await Promise.all([
          supabase
            .from(
              'training_records'
            )
            .select('*')
            .eq(
              'id',
              recordId
            )
            .single(),

          supabase
            .from(
              'training_attachments'
            )
            .select(
              'id,file_name,storage_path,mime_type,file_size,created_at'
            )
            .eq(
              'training_record_id',
              recordId
            )
            .order(
              'created_at',
              {
                ascending:
                  true,
              }
            ),
        ]);

      if (
        recordResponse.error ||
        !recordResponse.data
      ) {
        setError(
          'No fue posible cargar el registro.'
        );

        setLoading(false);

        return;
      }

      const r =
        recordResponse.data as TrainingRecord;

      setForm({
        client_name:
          r.client_name ??
          '',

        site:
          r.site,

        training_date:
          r.training_date,

        facilitator_id:
          r.facilitator_id,

        start_time:
          r.start_time.slice(
            0,
            5
          ),

        end_time:
          r.end_time.slice(
            0,
            5
          ),

        activity_name:
          r.activity_name,

        participants_count:
          r.participants_count ==
          null
            ? ''
            : String(
                r.participants_count
              ),

        observations:
          r.observations ??
          '',
      });

      setPersistedId(
        recordId
      );

      if (
        attachmentsResponse.error
      ) {
        setError(
          `El registro se cargó, pero no fue posible cargar sus adjuntos: ${attachmentsResponse.error.message}`
        );

        setExistingAttachments(
          []
        );
      } else {
        setExistingAttachments(
          (
            attachmentsResponse.data ??
            []
          ) as ExistingAttachment[]
        );
      }
    } else {
      /*
       * NUEVO REGISTRO
       */
      setForm({
        ...initialForm,

        training_date:
          new Date()
            .toISOString()
            .slice(0, 10),
      });

      setExistingAttachments(
        []
      );

      setFileSlots([
        createFileSlot(),
      ]);

      setPersistedId(null);
    }

    setLoading(false);
  }

  function setField<
    K extends keyof typeof form
  >(
    key: K,
    value:
      (typeof form)[K]
  ) {
    setForm(
      (prev) => ({
        ...prev,
        [key]: value,
      })
    );
  }

  /*
   * ==========================================
   * ADJUNTOS
   * ==========================================
   */

  function addFileSlot() {
    setFileSlots(
      (prev) => [
        ...prev,
        createFileSlot(),
      ]
    );
  }

  function changeFile(
    slotId: string,
    file: File | null
  ) {
    setError('');

    if (file) {
      const validation =
        validateFile(file);

      if (validation) {
        setError(
          validation
        );

        return;
      }
    }

    setFileSlots(
      (prev) =>
        prev.map(
          (slot) =>
            slot.id ===
            slotId
              ? {
                  ...slot,
                  file,
                }
              : slot
        )
    );
  }

  function removeFileSlot(
    slotId: string
  ) {
    setFileSlots(
      (prev) => {
        const next =
          prev.filter(
            (slot) =>
              slot.id !==
              slotId
          );

        if (
          next.length === 0
        ) {
          return [
            createFileSlot(),
          ];
        }

        return next;
      }
    );
  }

  function validateFile(
    file: File
  ): string | null {
    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      return `El archivo "${file.name}" supera el máximo de 10 MB.`;
    }

    const extension =
      file.name
        .split('.')
        .pop()
        ?.toLowerCase();

    const allowedExtensions =
      [
        'pdf',
        'jpg',
        'jpeg',
        'png',
      ];

    if (
      !extension ||
      !allowedExtensions.includes(
        extension
      )
    ) {
      return `El archivo "${file.name}" no tiene un formato permitido. Usa PDF, JPG o PNG.`;
    }

    return null;
  }

  /*
   * ==========================================
   * GUARDAR
   * ==========================================
   */

  async function submit(
    e: FormEvent
  ) {
    e.preventDefault();

    setError('');
    setSuccess('');

    /*
     * VALIDACIONES
     */

    if (
      !form.client_name.trim()
    ) {
      setError(
        'Ingresa el nombre del cliente.'
      );

      return;
    }

    if (
      !form.site.trim()
    ) {
      setError(
        'Ingresa la obra, faena o lugar.'
      );

      return;
    }

    if (
      !form.facilitator_id
    ) {
      setError(
        'Selecciona un relator/facilitador.'
      );

      return;
    }

    if (
      !form.activity_name.trim()
    ) {
      setError(
        'Ingresa el nombre de la charla, curso o actividad.'
      );

      return;
    }

    if (
      duration <= 0
    ) {
      setError(
        'La hora de término debe ser posterior a la hora de inicio.'
      );

      return;
    }

    /*
     * ARCHIVOS A SUBIR
     */

    const filesToUpload =
      fileSlots
        .map(
          (slot) => ({
            slotId:
              slot.id,

            file:
              slot.file,
          })
        )
        .filter(
          (
            item
          ): item is {
            slotId: string;
            file: File;
          } =>
            Boolean(
              item.file
            )
        );

    for (
      const item of
      filesToUpload
    ) {
      const validation =
        validateFile(
          item.file
        );

      if (validation) {
        setError(
          validation
        );

        return;
      }
    }

    setSaving(true);

    const id =
      persistedId ??
      recordId ??
      crypto.randomUUID();

    /*
     * ==========================================
     * GUARDAR DATOS DE CAPACITACIÓN
     * ==========================================
     */

    if (recordId) {
      /*
       * EDITAR REGISTRO EXISTENTE
       *
       * No modificamos created_by.
       */

      const {
        error:
          saveError,
      } =
        await supabase
          .from(
            'training_records'
          )
          .update({
            client_name:
              form.client_name.trim(),

            site:
              form.site.trim(),

            training_date:
              form.training_date,

            facilitator_id:
              form.facilitator_id,

            start_time:
              form.start_time,

            end_time:
              form.end_time,

            duration_minutes:
              duration,

            activity_name:
              form.activity_name.trim(),

            participants_count:
              form.participants_count
                ? Number(
                    form.participants_count
                  )
                : null,

            observations:
              form.observations.trim() ||
              null,
          })
          .eq(
            'id',
            recordId
          );

      if (saveError) {
        setError(
          `No fue posible guardar los cambios: ${saveError.message}`
        );

        setSaving(false);

        return;
      }
    } else if (
      !persistedId
    ) {
      /*
       * NUEVA CAPACITACIÓN
       */

      const {
        error:
          saveError,
      } =
        await supabase
          .from(
            'training_records'
          )
          .insert({
            id,

            client_name:
              form.client_name.trim(),

            site:
              form.site.trim(),

            training_date:
              form.training_date,

            facilitator_id:
              form.facilitator_id,

            start_time:
              form.start_time,

            end_time:
              form.end_time,

            duration_minutes:
              duration,

            activity_name:
              form.activity_name.trim(),

            participants_count:
              form.participants_count
                ? Number(
                    form.participants_count
                  )
                : null,

            observations:
              form.observations.trim() ||
              null,

            created_by:
              userId,
          });

      if (saveError) {
        setError(
          `No fue posible guardar la capacitación: ${saveError.message}`
        );

        setSaving(false);

        return;
      }

      /*
       * El registro ya existe.
       */
      setPersistedId(id);
    }

    /*
     * ==========================================
     * SUBIR TODOS LOS ADJUNTOS
     * ==========================================
     */

    const failedFiles: {
      slotId: string;
      file: File;
      reason: string;
    }[] = [];

    const uploadedAttachments:
      ExistingAttachment[] =
        [];

    for (
      const item of
      filesToUpload
    ) {
      const safeName =
        sanitizeFileName(
          item.file.name
        );

      const uniqueFileName =
        `${
          Date.now()
        }_${crypto.randomUUID()}_${safeName}`;

      const storagePath =
        `${userId}/${id}/${uniqueFileName}`;

      /*
       * Subir a Storage
       */
      const {
        error:
          uploadError,
      } =
        await supabase.storage
          .from(
            'training-evidence'
          )
          .upload(
            storagePath,
            item.file,
            {
              upsert:
                false,

              contentType:
                item.file.type ||
                undefined,
            }
          );

      if (uploadError) {
        failedFiles.push({
          slotId:
            item.slotId,

          file:
            item.file,

          reason:
            uploadError.message,
        });

        continue;
      }

      /*
       * Registrar archivo
       * en training_attachments
       */
      const {
        data:
          attachmentData,

        error:
          attachmentError,
      } =
        await supabase
          .from(
            'training_attachments'
          )
          .insert({
            training_record_id:
              id,

            file_name:
              item.file.name,

            storage_path:
              storagePath,

            mime_type:
              item.file.type ||
              null,

            file_size:
              item.file.size,

            uploaded_by:
              userId,
          })
          .select(
            'id,file_name,storage_path,mime_type,file_size,created_at'
          )
          .single();

      /*
       * Si Storage funcionó
       * pero BD falló,
       * eliminamos el archivo
       * para evitar huérfanos.
       */
      if (
        attachmentError ||
        !attachmentData
      ) {
        await supabase.storage
          .from(
            'training-evidence'
          )
          .remove([
            storagePath,
          ]);

        failedFiles.push({
          slotId:
            item.slotId,

          file:
            item.file,

          reason:
            attachmentError
              ?.message ??
            'No fue posible registrar el archivo.',
        });

        continue;
      }

      uploadedAttachments.push(
        attachmentData as ExistingAttachment
      );
    }

    /*
     * Mostrar adjuntos
     * correctamente guardados.
     */

    if (
      uploadedAttachments.length >
      0
    ) {
      setExistingAttachments(
        (prev) => [
          ...prev,
          ...uploadedAttachments,
        ]
      );
    }

    /*
     * Si fallaron archivos,
     * dejamos solo esos para
     * reintentar.
     */

    if (
      failedFiles.length >
      0
    ) {
      setFileSlots(
        failedFiles.map(
          (item) => ({
            id:
              crypto.randomUUID(),

            file:
              item.file,
          })
        )
      );

      setError(
        `La capacitación quedó guardada, pero ${failedFiles.length} adjunto(s) no pudieron subirse. Puedes volver a presionar "Guardar" para reintentarlos.`
      );

      setSaving(false);

      return;
    }

    /*
     * Limpiar selector
     * de archivos nuevos.
     */

    setFileSlots([
      createFileSlot(),
    ]);

    setSuccess(
      recordId
        ? 'Registro actualizado correctamente.'
        : filesToUpload.length >
            0
          ? `Capacitación registrada correctamente con ${filesToUpload.length} adjunto(s).`
          : 'Capacitación registrada correctamente.'
    );

    setSaving(false);

    setTimeout(
      onSaved,
      500
    );
  }

  /*
   * ==========================================
   * ABRIR ADJUNTO
   * ==========================================
   */

  async function openAttachment(
    attachment:
      ExistingAttachment
  ) {
    const tab =
      window.open(
        '',
        '_blank'
      );

    const {
      data,
      error,
    } =
      await supabase.storage
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
      tab.opener =
        null;

      tab.location.href =
        data.signedUrl;
    }
  }

  /*
   * ==========================================
   * PANTALLA DE CARGA
   * ==========================================
   */

  if (loading) {
    return (
      <div className="panel loading-box">
        Cargando formulario…
      </div>
    );
  }

  /*
   * ==========================================
   * FORMULARIO
   * ==========================================
   */

  return (
    <div className="page-stack">

      <div className="page-heading compact">

        <div>
          <span className="eyebrow">
            {recordId
              ? 'EDICIÓN'
              : 'NUEVO REGISTRO'}
          </span>

          <h1>
            {recordId
              ? 'Editar capacitación'
              : 'Registrar capacitación'}
          </h1>

          <p>
            Los campos con
            asterisco son
            obligatorios.
            La duración se
            calcula
            automáticamente.
          </p>
        </div>

      </div>

      <form
        onSubmit={submit}
        className="form-grid"
      >

        {/* CLIENTE */}

        <Field
          label="CLIENTE"
          required
        >
          <input
            type="text"
            value={
              form.client_name
            }
            onChange={(e) =>
              setField(
                'client_name',
                e.target.value
              )
            }
            placeholder="Ej.: ALTIUS"
            required
          />
        </Field>

        {/* OBRA / FAENA / LUGAR */}

        <Field
          label="OBRA / FAENA / LUGAR"
          required
        >
          <input
            type="text"
            value={
              form.site
            }
            onChange={(e) =>
              setField(
                'site',
                e.target.value
              )
            }
            placeholder="Ej.: MACUL"
            required
          />
        </Field>

        {/* FECHA */}

        <Field
          label="FECHA"
          required
        >
          <input
            type="date"
            value={
              form.training_date
            }
            onChange={(e) =>
              setField(
                'training_date',
                e.target.value
              )
            }
            required
          />
        </Field>

        {/* RELATOR */}

        <Field
          label="RELATOR / FACILITADOR"
          required
        >
          <select
            value={
              form.facilitator_id
            }
            onChange={(e) =>
              setField(
                'facilitator_id',
                e.target.value
              )
            }
            required
          >
            <option value="">
              Seleccionar
            </option>

            {facilitators
              .filter(
                (x) =>
                  x.active ||
                  x.id ===
                    form.facilitator_id
              )
              .map(
                (x) => (
                  <option
                    key={
                      x.id
                    }
                    value={
                      x.id
                    }
                  >
                    {x.name}

                    {!x.active
                      ? ' (inactivo)'
                      : ''}
                  </option>
                )
              )}
          </select>
        </Field>

        {/* =====================================
            HORAS - SELECTOR 24 HORAS
        ===================================== */}

        <div className="two-col">

          <Field
            label="HORA INICIO"
            required
          >
            <TimeSelector
              value={
                form.start_time
              }
              onChange={(
                value
              ) =>
                setField(
                  'start_time',
                  value
                )
              }
            />
          </Field>

          <Field
            label="HORA TÉRMINO"
            required
          >
            <TimeSelector
              value={
                form.end_time
              }
              onChange={(
                value
              ) =>
                setField(
                  'end_time',
                  value
                )
              }
            />
          </Field>

        </div>

        {/* DURACIÓN */}

        <Field label="DURACIÓN">

          <div
            className={`duration-box ${
              duration <=
              0
                ? 'invalid'
                : ''
            }`}
          >
            {duration > 0
              ? formatDuration(
                  duration
                )
              : 'Revisa las horas ingresadas'}
          </div>

        </Field>

        {/* ACTIVIDAD */}

        <Field
          label="NOMBRE DE CHARLA / CURSO / ACTIVIDAD"
          required
        >
          <input
            type="text"
            value={
              form.activity_name
            }
            onChange={(e) =>
              setField(
                'activity_name',
                e.target.value
              )
            }
            placeholder="Ej.: CHARLA HÁBITOS SALUDABLES SEGÚN DS 44"
            required
          />
        </Field>

        {/* PARTICIPANTES */}

        <Field
          label="N° DE PARTICIPANTES"
        >
          <input
            type="number"
            min="0"
            step="1"
            value={
              form.participants_count
            }
            onChange={(e) =>
              setField(
                'participants_count',
                e.target.value
              )
            }
            placeholder="Opcional"
          />
        </Field>

        {/* OBSERVACIONES */}

        <Field
          label="OBSERVACIONES"
        >
          <textarea
            rows={4}
            value={
              form.observations
            }
            onChange={(e) =>
              setField(
                'observations',
                e.target.value
              )
            }
            placeholder="Opcional"
          />
        </Field>

        {/* =====================================
            ADJUNTOS MÚLTIPLES
        ===================================== */}

        <div className="field-card">

          <span className="field-label">
            RESPALDOS / ADJUNTOS
          </span>

          <small
            className="helper"
            style={{
              display:
                'block',

              marginBottom:
                '14px',
            }}
          >
            Puedes agregar todos
            los archivos que
            necesites. Formatos
            permitidos: PDF,
            JPG y PNG. Máximo
            10 MB por archivo.
          </small>

          {/* ADJUNTOS GUARDADOS */}

          {existingAttachments.length >
            0 && (

            <div
              style={{
                display:
                  'grid',

                gap:
                  '8px',

                marginBottom:
                  '18px',
              }}
            >

              <strong
                style={{
                  fontSize:
                    '13px',
                }}
              >
                Adjuntos guardados
              </strong>

              {existingAttachments.map(
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
                        '12px',

                      padding:
                        '10px 12px',

                      border:
                        '1px solid #ddd',

                      borderRadius:
                        '8px',

                      background:
                        '#fafafa',
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
                        {index + 1}.{' '}
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

                  </div>

                )
              )}

            </div>

          )}

          {/* NUEVOS ADJUNTOS */}

          <div
            style={{
              display:
                'grid',

              gap:
                '12px',
            }}
          >

            {fileSlots.map(
              (
                slot,
                index
              ) => (

                <div
                  key={
                    slot.id
                  }
                  style={{
                    display:
                      'grid',

                    gap:
                      '7px',

                    padding:
                      '12px',

                    border:
                      '1px solid #e0e0de',

                    borderRadius:
                      '8px',
                  }}
                >

                  <div
                    style={{
                      display:
                        'flex',

                      alignItems:
                        'center',

                      justifyContent:
                        'space-between',

                      gap:
                        '12px',
                    }}
                  >

                    <strong
                      style={{
                        fontSize:
                          '12px',
                      }}
                    >
                      Adjunto{' '}
                      {existingAttachments.length +
                        index +
                        1}
                    </strong>

                    {(fileSlots.length >
                      1 ||
                      slot.file) && (

                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() =>
                          removeFileSlot(
                            slot.id
                          )
                        }
                      >
                        Quitar
                      </button>

                    )}

                  </div>

                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    onChange={(e) =>
                      changeFile(
                        slot.id,

                        e.target
                          .files?.[0] ??
                          null
                      )
                    }
                  />

                  {slot.file && (

                    <small className="helper">
                      {
                        slot.file.name
                      }{' '}
                      ·{' '}
                      {formatBytes(
                        slot.file.size
                      )}
                    </small>

                  )}

                </div>

              )
            )}

          </div>

          <button
            type="button"
            className="btn secondary"
            style={{
              marginTop:
                '14px',
            }}
            onClick={
              addFileSlot
            }
          >
            + Agregar otro adjunto
          </button>

        </div>

        {/* MENSAJES */}

        {error && (
          <div className="alert error">
            {error}
          </div>
        )}

        {success && (
          <div className="alert success">
            {success}
          </div>
        )}

        {/* BOTONES */}

        <div className="form-actions">

          <button
            type="button"
            className="btn ghost"
            onClick={
              onCancel
            }
            disabled={
              saving
            }
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="btn primary"
            disabled={
              saving
            }
          >
            {saving
              ? 'Guardando…'
              : recordId
                ? 'Guardar cambios'
                : 'Guardar capacitación'}
          </button>

        </div>

      </form>

    </div>
  );
}

/*
 * ==========================================
 * COMPONENTE FIELD
 * ==========================================
 */

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children:
    React.ReactNode;
}) {
  return (
    <label className="field-card">

      <span className="field-label">
        {label}

        {required && (
          <b> *</b>
        )}
      </span>

      {children}

    </label>
  );
}

/*
 * ==========================================
 * SELECTOR DE HORA 24 HORAS
 * ==========================================
 *
 * Horas:   00 a 23
 * Minutos: 00 a 59
 *
 * No utiliza el selector nativo
 * AM / PM del navegador.
 */

function TimeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange:
    (value: string) =>
      void;
}) {
  const [
    rawHour = '08',
    rawMinute = '00',
  ] =
    value.split(':');

  const currentHour =
    rawHour.padStart(
      2,
      '0'
    );

  const currentMinute =
    rawMinute.padStart(
      2,
      '0'
    );

  const hours =
    Array.from(
      {
        length: 24,
      },
      (
        _,
        index
      ) =>
        String(
          index
        ).padStart(
          2,
          '0'
        )
    );

  const minutes =
    Array.from(
      {
        length: 60,
      },
      (
        _,
        index
      ) =>
        String(
          index
        ).padStart(
          2,
          '0'
        )
    );

  function changeHour(
    hour: string
  ) {
    onChange(
      `${hour}:${currentMinute}`
    );
  }

  function changeMinute(
    minute: string
  ) {
    onChange(
      `${currentHour}:${minute}`
    );
  }

  return (
    <div
      style={{
        display:
          'grid',

        gridTemplateColumns:
          '1fr auto 1fr',

        alignItems:
          'center',

        gap:
          '10px',

        width:
          '100%',
      }}
    >

      {/* HORA */}

      <select
        value={
          currentHour
        }
        onChange={(e) =>
          changeHour(
            e.target.value
          )
        }
        aria-label="Hora"
        required
        style={{
          width:
            '100%',

          minWidth:
            0,
        }}
      >

        {hours.map(
          (hour) => (

            <option
              key={
                hour
              }
              value={
                hour
              }
            >
              {hour}
            </option>

          )
        )}

      </select>

      {/* DOS PUNTOS */}

      <span
        aria-hidden="true"
        style={{
          fontSize:
            '20px',

          fontWeight:
            700,

          lineHeight:
            1,

          color:
            '#444',
        }}
      >
        :
      </span>

      {/* MINUTOS */}

      <select
        value={
          currentMinute
        }
        onChange={(e) =>
          changeMinute(
            e.target.value
          )
        }
        aria-label="Minutos"
        required
        style={{
          width:
            '100%',

          minWidth:
            0,
        }}
      >

        {minutes.map(
          (minute) => (

            <option
              key={
                minute
              }
              value={
                minute
              }
            >
              {minute}
            </option>

          )
        )}

      </select>

    </div>
  );
}

/*
 * ==========================================
 * UTILIDADES
 * ==========================================
 */

function sanitizeFileName(
  name: string
) {
  return name
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
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