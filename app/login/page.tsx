'use client';
import { useState } from 'react';
import { Hotel, Loader2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const password = new FormData(event.currentTarget).get('password');
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw Error(result.error || 'No se pudo ingresar.');
      window.location.replace('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo ingresar.');
      setBusy(false);
    }
  }
  return <main className="login-screen"><section className="panel login-card">
    <div className="brand-icon"><Hotel size={28}/></div>
    <div><div className="eyebrow">HOTEL COPAHUE</div><h1>Ingresar</h1><p className="muted">Acceso privado a la administración de prueba.</p></div>
    <form onSubmit={submit}>
      <label className="field"><span>Contraseña</span><Input name="password" type="password" autoComplete="current-password" required maxLength={256} autoFocus disabled={busy}/></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? <Loader2 size={16} className="spin"/> : <LockKeyhole size={16}/>} {busy ? 'Ingresando…' : 'Ingresar'}</Button>
    </form>
    <small className="muted">Solicitá la contraseña al responsable del hotel.</small>
  </section></main>;
}
