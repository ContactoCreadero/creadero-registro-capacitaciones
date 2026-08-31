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

const OTHER_FACILITATOR_VALUE =
  '__OTROS__';

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
    otherFacilitator,
    setOtherFacilitator,
  ] = useState('');

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
          r.facilitator_id ??
          '',

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

      setOtherFacilitator(
        ''
      );

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
      setForm({
        ...initialForm,

        training_date:
          new Date()
            .toISOString()
            .slice(0, 10),
      });

      setOtherFacilitator(
        ''
      );

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

  async function resolveFacilitatorId():
    Promise<string> {
    if (
      form.facilitator_id !==
      OTHER_FACILITATOR_VALUE
    ) {
      return form.facilitator_id;
    }

    const name =
      otherFacilitator.trim();

    if (!name) {
      throw new Error(
        'Escribe el nombre del relator/facilitador.'
      );
    }

    const existing =
      facilitators.find(
        (item) =>
          item.name
            .trim()
            .toLocaleLowerCase(
              'es-CL'
            ) ===
          name.toLocaleLowerCase(
            'es-CL'
          )
      );

    if (existing) {
      setField(
        'facilitator_id',
        existing.id
      );

      setOtherFacilitator(
        ''
      );

      return existing.id;
    }

    const {
      data,
      error:
        insertError,
    } =
      await supabase
        .from(
          'facilitators'
        )
        .insert({
          name,
          active: true,
          created_by:
            userId,
        })
        .select(
          'id,name,active'
        )
        .single();

    if (
      insertError ||
      !data
    ) {
      throw new Error(
        `No fue posible crear el nuevo relator/facilitador: ${
          insertError
            ?.message ??
          'error desconocido'
        }`
      );
    }

    const created =
      data as CatalogItem;

    setFacilitators(
      (prev) =>
        [
          ...prev,
          created,
        ].sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
              'es-CL',
              {
                sensitivity:
                  'base',
              }
            )
        )
    );

    setField(
      'facilitator_id',
      created.id
    );

    setOtherFacilitator(
      ''
    );

    return created.id;
  }

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

  async function submit(
    e: FormEvent
  ) {
    e.preventDefault();

    setError('');
    setSuccess('');

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
      form.facilitator_id ===
        OTHER_FACILITATOR_VALUE &&
      !otherFacilitator.trim()
    ) {
      setError(
        'Escribe el nombre del relator/facilitador.'
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

    let facilitatorId =
      form.facilitator_id;

    try {
      facilitatorId =
        await resolveFacilitatorId();
    } catch (
      facilitatorError
    ) {
      setError(
        facilitatorError instanceof
          Error
          ? facilitatorError.message
          : 'No fue posible guardar el relator/facilitador.'
      );

      setSaving(false);

      return;
    }

    const id =
      persistedId ??
      recordId ??
      crypto.randomUUID();

    if (recordId) {
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
              facilitatorId,

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
              facilitatorId,

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

      setPersistedId(id);
    }

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

  if (loading) {
    return (
      <div className="panel loading-box">
        Cargando formulario…
      </div>
    );
  }

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

        <Field
          label="RELATOR / FACILITADOR"
          required
        >
          <select
            value={
              form.facilitator_id
            }
            onChange={(e) => {
              const value =
                e.target.value;

              setField(
                'facilitator_id',
                value
              );

              if (
                value !==
                OTHER_FACILITATOR_VALUE
              ) {
                setOtherFacilitator(
                  ''
                );
              }
            }}
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

            <option
              value={
                OTHER_FACILITATOR_VALUE
              }
            >
              OTROS
            </option>
          </select>

          {form.facilitator_id ===
            OTHER_FACILITATOR_VALUE && (
            <div
              style={{
                marginTop:
                  '12px',
              }}
            >
              <span
                className="field-label"
                style={{
                  display:
                    'block',

                  marginBottom:
                    '7px',
                }}
              >
                NOMBRE DEL RELATOR / FACILITADOR
                <b> *</b>
              </span>

              <input
                type="text"
                value={
                  otherFacilitator
                }
                onChange={(e) =>
                  setOtherFacilitator(
                    e.target.value
                  )
                }
                placeholder="Escribe el nombre del relator/facilitador"
                autoFocus
                required
              />
            </div>
          )}
        </Field>

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
              ) => {
                const inputId =
                  `attachment-${slot.id}`;

                return (
                  <div
                    key={
                      slot.id
                    }
                    style={{
                      display:
                        'grid',

                      gap:
                        '9px',

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
                      id={
                        inputId
                      }
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
                      style={{
                        position:
                          'absolute',

                        width:
                          '1px',

                        height:
                          '1px',

                        padding:
                          0,

                        margin:
                          '-1px',

                        overflow:
                          'hidden',

                        clip:
                          'rect(0, 0, 0, 0)',

                        whiteSpace:
                          'nowrap',

                        border:
                          0,
                      }}
                    />

                    <div
                      style={{
                        display:
                          'flex',

                        alignItems:
                          'center',

                        gap:
                          '12px',

                        flexWrap:
                          'wrap',
                      }}
                    >
                      <label
                        htmlFor={
                          inputId
                        }
                        className="btn secondary"
                        style={{
                          cursor:
                            'pointer',

                          width:
                            'fit-content',
                        }}
                      >
                        📎{' '}
                        {slot.file
                          ? 'Cambiar archivo'
                          : 'Seleccionar archivo'}
                      </label>

                      <small className="helper">
                        {slot.file
                          ? `${slot.file.name} · ${formatBytes(
                              slot.file.size
                            )}`
                          : 'Ningún archivo seleccionado'}
                      </small>
                    </div>

                  </div>
                );
              }
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
