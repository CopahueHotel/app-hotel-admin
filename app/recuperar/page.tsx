'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Hotel, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function RecoveryPage() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const value = window.location.hash.slice(1);
    queueMicrotask(() => { setToken(value); setReady(true); });
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, data = new FormData(form);
    setError(''); setMessage('');
    if (token && data.get('password') !== data.get('confirmation')) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/recovery/${token ? 'confirm' : 'request'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token, password: data.get('password') } : { email: data.get('email') }),
      });
      const result = await response.json() as { error?: string; message: string };
      if (!response.ok) throw Error(result.error || 'No se pudo recuperar el acceso.');
      setMessage(result.message); form.reset();
      if (token) window.history.replaceState(null, '', '/recuperar');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo recuperar el acceso.'); }
    finally { setBusy(false); }
  }
  return <main className="login-screen"><section className="panel login-card">
    <div className="brand-icon"><Hotel size={28}/></div>
    <div><div className="eyebrow">HOTEL COPAHUE</div><h1>{token ? 'Nueva contraseña' : 'Recuperar acceso'}</h1><p className="muted">{token ? 'El enlace vence a los 15 minutos y se utiliza una sola vez.' : 'Ingresá el email registrado en tu cuenta.'}</p></div>
    {!message && <form onSubmit={submit}>
      {token ? <>
        <label className="field"><span>Nueva contraseña</span><Input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={busy}/><small>Entre 12 y 256 caracteres.</small></label>
        <label className="field"><span>Repetir contraseña</span><Input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={busy}/></label>
      </> : <label className="field"><span>Email</span><Input name="email" type="email" autoComplete="email" maxLength={240} required disabled={busy}/></label>}
      {error && <p className="login-error" role="alert">{error}</p>}
      <Button type="submit" disabled={busy || !ready}>{busy && <Loader2 size={16} className="spin"/>}{busy ? 'Procesando…' : token ? 'Guardar contraseña' : 'Enviar enlace'}</Button>
    </form>}
    {message && <p role="status">{message}</p>}
    {message && !token && <Button variant="outline" onClick={() => setMessage('')}>Volver a solicitar</Button>}
    <a href="/login">Volver al inicio de sesión</a>
  </section></main>;
}
