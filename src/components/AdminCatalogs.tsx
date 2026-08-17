'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';
import type { CatalogItem } from '@/lib/types';
import { EditIcon } from './Icons';

export default function AdminCatalogs() {
  const [items, setItems] =
    useState<CatalogItem[]>([]);

  const [newName, setNewName] =
    useState('');

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [editingName, setEditingName] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');

    const { data, error } = await supabase
      .from('facilitators')
      .select('id,name,active,created_at')
      .order('name');

    if (error) {
      setError(error.message);
    }

    setItems((data ?? []) as CatalogItem[]);
    setLoading(false);
  }

  async function add(e: FormEvent) {
    e.preventDefault();

    const name = newName.trim();

    if (!name) return;

    const { error } = await supabase
      .from('facilitators')
      .insert({ name });

    if (error) {
      setError(
        error.code === '23505'
          ? 'Ese relator/facilitador ya existe.'
          : error.message
      );
    } else {
      setNewName('');
      await load();
    }
  }

  async function saveEdit(id: string) {
    const name = editingName.trim();

    if (!name) return;

    const { error } = await supabase
      .from('facilitators')
      .update({ name })
      .eq('id', id);

    if (error) {
      setError(
        error.code === '23505'
          ? 'Ese nombre ya existe.'
          : error.message
      );
    } else {
      setEditingId(null);
      setEditingName('');
      await load();
    }
  }

  async function toggleActive(
    item: CatalogItem
  ) {
    const { error } = await supabase
      .from('facilitators')
      .update({ active: !item.active })
      .eq('id', item.id);

    if (error) {
      setError(error.message);
    } else {
      await load();
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">
            ADMINISTRACIÓN
          </span>

          <h1>
            Relatores / Facilitadores
          </h1>

          <p>
            Agrega, renombra, activa o desactiva
            los relatores/facilitadores disponibles
            en el formulario.
          </p>
        </div>
      </div>

      <section className="admin-panel">

        <form
          className="catalog-add"
          onSubmit={add}
        >
          <input
            value={newName}
            onChange={(e) =>
              setNewName(e.target.value)
            }
            placeholder="Nombre del relator o facilitador"
          />

          <button className="btn primary">
            + Agregar
          </button>
        </form>

        {error && (
          <div className="alert error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="empty-state">
            Cargando…
          </div>
        ) : (
          <div className="catalog-list">

            {items.length === 0 && (
              <div className="empty-state">
                Todavía no hay relatores o facilitadores.
                Agrega el primero.
              </div>
            )}

            {items.map((item) => (
              <div
                className="catalog-row"
                key={item.id}
              >
                {editingId === item.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) =>
                      setEditingName(
                        e.target.value
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void saveEdit(item.id);
                      }

                      if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <div>
                    <strong>
                      {item.name}
                    </strong>

                    <span
                      className={`status ${
                        item.active
                          ? 'active'
                          : 'inactive'
                      }`}
                    >
                      {item.active
                        ? 'Activo'
                        : 'Inactivo'}
                    </span>
                  </div>
                )}

                <div className="catalog-actions">

                  {editingId === item.id ? (
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() =>
                        void saveEdit(item.id)
                      }
                    >
                      Guardar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="icon-btn"
                      title="Renombrar"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditingName(item.name);
                      }}
                    >
                      <EditIcon />
                    </button>
                  )}

                  <button
                    type="button"
                    className={`btn small ${
                      item.active
                        ? 'ghost'
                        : 'secondary'
                    }`}
                    onClick={() =>
                      void toggleActive(item)
                    }
                  >
                    {item.active
                      ? 'Desactivar'
                      : 'Activar'}
                  </button>

                </div>
              </div>
            ))}
          </div>
        )}

      </section>
    </div>
  );
}