'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateDuration, formatDuration } from '@/lib/format';
import type { CatalogItem, TrainingRecord } from '@/lib/types';

type Props = {
  recordId?: string | null;
  userId: string;
  onSaved: () => void;
  onCancel: () => void;
};

const initialForm = {
  client_id: '',
  site: '',
  training_date: new Date().toISOString().slice(0, 10),
  facilitator_id: '',
  start_time: '08:00',
  end_time: '08:30',
  activity_name: '',
  participants_count: '',
  observations: '',
};

export default function TrainingForm({ recordId, userId, onSaved, onCancel }: Props) {
  const [clients, setClients] = useState<CatalogItem[]>([]);
  const [facilitators, setFacilitators] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState(initialForm);
  const [existingAttachment, setExistingAttachment] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(Boolean(recordId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const duration = useMemo(() => calculateDuration(form.start_time, form.end_time), [form.start_time, form.end_time]);

  useEffect(() => {
    void load();
  }, [recordId]);

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: f }] = await Promise.all([
      supabase.from('clients').select('id,name,active').order('name'),
      supabase.from('facilitators').select('id,name,active').order('name'),
    ]);
    setClients((c ?? []) as CatalogItem[]);
    setFacilitators((f ?? []) as CatalogItem[]);

    if (recordId) {
      const { data, error } = await supabase.from('training_records').select('*').eq('id', recordId).single();
      if (error || !data) {
        setError('No fue posible cargar el registro.');
      } else {
        const r = data as TrainingRecord;
        setForm({
          client_id: r.client_id,
          site: r.site,
          training_date: r.training_date,
          facilitator_id: r.facilitator_id,
          start_time: r.start_time.slice(0, 5),
          end_time: r.end_time.slice(0, 5),
          activity_name: r.activity_name,
          participants_count: r.participants_count == null ? '' : String(r.participants_count),
          observations: r.observations ?? '',
        });
        setExistingAttachment(r.attachment_path);
      }
    } else {
      setForm(initialForm);
      setExistingAttachment(null);
      setFile(null);
    }
    setLoading(false);
  }

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (duration <= 0) {
      setError('La hora de término debe ser posterior a la hora de inicio.');
      return;
    }
    if (!form.client_id || !form.facilitator_id) {
      setError('Selecciona cliente y relator/facilitador.');
      return;
    }

    setSaving(true);
    const id = recordId ?? crypto.randomUUID();
    let attachmentPath = existingAttachment;
    let uploadedNewPath: string | null = null;

    if (file) {
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${userId}/${id}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from('training-evidence').upload(path, file, { upsert: false });
      if (uploadError) {
        setError(`No fue posible subir el respaldo: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      uploadedNewPath = path;
      attachmentPath = path;
    }

    const payload = {
      id,
      client_id: form.client_id,
      site: form.site.trim(),
      training_date: form.training_date,
      facilitator_id: form.facilitator_id,
      start_time: form.start_time,
      end_time: form.end_time,
      duration_minutes: duration,
      activity_name: form.activity_name.trim(),
      participants_count: form.participants_count ? Number(form.participants_count) : null,
      observations: form.observations.trim() || null,
      attachment_path: attachmentPath,
      created_by: userId,
    };

    const { error: saveError } = await supabase.from('training_records').upsert(payload, { onConflict: 'id' });
    if (saveError) {
      if (uploadedNewPath) await supabase.storage.from('training-evidence').remove([uploadedNewPath]);
      setError(`No fue posible guardar: ${saveError.message}`);
      setSaving(false);
      return;
    }

    if (uploadedNewPath && existingAttachment && existingAttachment !== uploadedNewPath) {
      await supabase.storage.from('training-evidence').remove([existingAttachment]);
    }

    setSuccess(recordId ? 'Registro actualizado correctamente.' : 'Capacitación registrada correctamente.');
    setSaving(false);
    setTimeout(onSaved, 450);
  }

  if (loading) return <div className="panel loading-box">Cargando formulario…</div>;

  return (
    <div className="page-stack">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">{recordId ? 'EDICIÓN' : 'NUEVO REGISTRO'}</span>
          <h1>{recordId ? 'Editar capacitación' : 'Registrar capacitación'}</h1>
          <p>Los campos con asterisco son obligatorios. La duración se calcula automáticamente.</p>
        </div>
      </div>

      <form onSubmit={submit} className="form-grid">
        <Field label="CLIENTE" required>
          <select value={form.client_id} onChange={(e) => setField('client_id', e.target.value)} required>
            <option value="">Seleccionar</option>
            {clients.filter((x) => x.active || x.id === form.client_id).map((x) => <option key={x.id} value={x.id}>{x.name}{!x.active ? ' (inactivo)' : ''}</option>)}
          </select>
        </Field>

        <Field label="OBRA / FAENA / LUGAR" required>
          <input value={form.site} onChange={(e) => setField('site', e.target.value)} placeholder="Ej.: MACUL" required />
        </Field>

        <Field label="FECHA" required>
          <input type="date" value={form.training_date} onChange={(e) => setField('training_date', e.target.value)} required />
        </Field>

        <Field label="RELATOR / FACILITADOR" required>
          <select value={form.facilitator_id} onChange={(e) => setField('facilitator_id', e.target.value)} required>
            <option value="">Seleccionar</option>
            {facilitators.filter((x) => x.active || x.id === form.facilitator_id).map((x) => <option key={x.id} value={x.id}>{x.name}{!x.active ? ' (inactivo)' : ''}</option>)}
          </select>
        </Field>

        <div className="two-col">
          <Field label="HORA INICIO" required>
            <input type="time" value={form.start_time} onChange={(e) => setField('start_time', e.target.value)} required />
          </Field>
          <Field label="HORA TÉRMINO" required>
            <input type="time" value={form.end_time} onChange={(e) => setField('end_time', e.target.value)} required />
          </Field>
        </div>

        <Field label="DURACIÓN">
          <div className={`duration-box ${duration <= 0 ? 'invalid' : ''}`}>{duration > 0 ? formatDuration(duration) : 'Revisa las horas ingresadas'}</div>
        </Field>

        <Field label="NOMBRE DE CHARLA / CURSO / ACTIVIDAD" required>
          <input value={form.activity_name} onChange={(e) => setField('activity_name', e.target.value)} placeholder="Ej.: CHARLA HÁBITOS SALUDABLES SEGÚN DS 44" required />
        </Field>

        <Field label="N° DE PARTICIPANTES">
          <input type="number" min="0" step="1" value={form.participants_count} onChange={(e) => setField('participants_count', e.target.value)} placeholder="Opcional" />
        </Field>

        <Field label="OBSERVACIONES">
          <textarea rows={4} value={form.observations} onChange={(e) => setField('observations', e.target.value)} placeholder="Opcional" />
        </Field>

        <Field label="RESPALDO (PDF / JPG / PNG)">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {existingAttachment && !file && <small className="helper">Este registro ya tiene un respaldo. Si cargas otro, será reemplazado.</small>}
          {file && <small className="helper">Archivo seleccionado: {file.name}</small>}
        </Field>

        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Guardando…' : recordId ? 'Guardar cambios' : 'Guardar capacitación'}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="field-card">
      <span className="field-label">{label}{required && <b> *</b>}</span>
      {children}
    </label>
  );
}
