'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Props = { onNew: () => void; onRecords: () => void };

type Stats = { total: number; month: number; clients: number; facilitators: number };

export default function Dashboard({ onNew, onRecords }: Props) {
  const [stats, setStats] = useState<Stats>({ total: 0, month: 0, clients: 0, facilitators: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstIso = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
    const [total, month, clients, facilitators] = await Promise.all([
      supabase.from('training_records').select('*', { count: 'exact', head: true }),
      supabase.from('training_records').select('*', { count: 'exact', head: true }).gte('training_date', firstIso),
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('active', true),
      supabase.from('facilitators').select('*', { count: 'exact', head: true }).eq('active', true),
    ]);
    setStats({
      total: total.count ?? 0,
      month: month.count ?? 0,
      clients: clients.count ?? 0,
      facilitators: facilitators.count ?? 0,
    });
    setLoading(false);
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CREADERO</span>
          <h1>Registro de capacitaciones</h1>
          <p>Centraliza las actividades realizadas a clientes, sus respaldos y datos de ejecución.</p>
        </div>
        <button className="btn primary" onClick={onNew}>+ Nueva capacitación</button>
      </div>

      <div className="stats-grid">
        <article className="stat-card"><span>Total registradas</span><strong>{loading ? '—' : stats.total}</strong></article>
        <article className="stat-card"><span>Este mes</span><strong>{loading ? '—' : stats.month}</strong></article>
        <article className="stat-card"><span>Clientes activos</span><strong>{loading ? '—' : stats.clients}</strong></article>
        <article className="stat-card"><span>Relatores activos</span><strong>{loading ? '—' : stats.facilitators}</strong></article>
      </div>

      <section className="feature-panel">
        <div>
          <span className="eyebrow">ACCESO RÁPIDO</span>
          <h2>Consulta, selecciona, imprime o edita registros.</h2>
          <p>La vista de registros permite buscar por cliente, lugar, actividad o relator y preparar fichas impresas de una o varias capacitaciones.</p>
        </div>
        <button className="btn secondary" onClick={onRecords}>Ver registros</button>
      </section>
    </div>
  );
}
