'use client';

import Image from 'next/image';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import Dashboard from './Dashboard';
import TrainingForm from './TrainingForm';
import Records from './Records';
import AdminCatalogs from './AdminCatalogs';
import { HomeIcon, ListIcon, LogoutIcon, PlusIcon, SettingsIcon } from './Icons';

type View = 'home' | 'new' | 'records' | 'admin';

export default function AppShell({ profile }: { profile: Profile }) {
  const [view, setView] = useState<View>('home');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  function navigate(next: View) {
    setEditingId(null);
    setView(next);
    setMobileMenu(false);
  }

  function edit(id: string) {
    setEditingId(id);
    setView('new');
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="sidebar-brand"><Image src="/logo.png" alt="Creadero" width={205} height={45} priority /></div>
        <nav>
          <Nav active={view === 'home'} onClick={() => navigate('home')} icon={<HomeIcon />}>Inicio</Nav>
          <Nav active={view === 'new'} onClick={() => navigate('new')} icon={<PlusIcon />}>Nueva capacitación</Nav>
          <Nav active={view === 'records'} onClick={() => navigate('records')} icon={<ListIcon />}>Registros</Nav>
          {profile.role === 'admin' && <Nav active={view === 'admin'} onClick={() => navigate('admin')} icon={<SettingsIcon />}>Administración</Nav>}
        </nav>
        <div className="sidebar-footer">
          <div className="user-block"><span>{profile.full_name || profile.email || 'Usuario'}</span><small>{profile.role === 'admin' ? 'Administrador' : 'Usuario'}</small></div>
          <button className="logout" onClick={() => void supabase.auth.signOut()}><LogoutIcon /> Cerrar sesión</button>
        </div>
      </aside>

      <div className="main-area">
        <header className="mobile-header">
          <Image src="/logo.png" alt="Creadero" width={155} height={34} />
          <button className="menu-btn" onClick={() => setMobileMenu((v) => !v)} aria-label="Abrir menú">☰</button>
        </header>
        <main className="content">
          {view === 'home' && <Dashboard onNew={() => navigate('new')} onRecords={() => navigate('records')} />}
          {view === 'new' && <TrainingForm recordId={editingId} userId={profile.id} onSaved={() => navigate('records')} onCancel={() => navigate('records')} />}
          {view === 'records' && <Records role={profile.role} onEdit={edit} onNew={() => navigate('new')} />}
          {view === 'admin' && profile.role === 'admin' && <AdminCatalogs />}
        </main>
      </div>
      {mobileMenu && <button className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} />}
    </div>
  );
}

function Nav({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{children}</span></button>;
}
