'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Hotel,Loader2,LockKeyhole } from 'lucide-react';
import { useState } from 'react';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values=new FormData(event.currentTarget);
    const password=values.get('password'),email=values.get('email');
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email,password }),
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
    <div><div className="eyebrow">HOTEL COPAHUE</div><h1>Ingresar</h1><p className="muted">Acceso privado a la administración del hotel.</p></div>
    <form onSubmit={submit}>
      <label className="field"><span>Email</span><Input name="email" type="email" autoComplete="username" required maxLength={240} disabled={busy}/></label>
      <label className="field"><span>Contraseña</span><Input name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={busy}/></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? <Loader2 size={16} className="spin"/> : <LockKeyhole size={16}/>} {busy ? 'Ingresando…' : 'Ingresar'}</Button>
    </form>
    <a href="/recuperar">Olvidé mi contraseña</a>
  </section></main>;
}
