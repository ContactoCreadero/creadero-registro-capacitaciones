'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError('No fue posible iniciar sesión. Revisa correo y contraseña.');
    setLoading(false);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <Image src="/logo.png" alt="Creadero" width={250} height={55} priority />
          <div className="brand-rule" />
          <p>REGISTRO DE CAPACITACIONES</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>
            Correo electrónico
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="btn primary full" disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
      </section>
    </main>
  );
}
