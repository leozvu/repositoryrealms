'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { preferredWorkspaceSurface } from '@/lib/collaboration';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async e => {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await signIn('credentials', { email, password, otp, redirect: false });
    setBusy(false);
    if (res?.error) setErr('Email, mật khẩu hoặc mã 2FA không đúng');
    else {
      let destination = '/dashboard';
      try {
        const pilotResponse = await fetch('/api/realm-demo/pilot', { cache: 'no-store' });
        const pilot = await pilotResponse.json();
        const resolvedSurface = pilot.user?.preference === 'auto'
          ? preferredWorkspaceSurface()
          : pilot.user?.resolvedSurface;
        if (pilotResponse.ok && pilot.user?.allowed && resolvedSurface === 'realm') destination = '/realm';
      } catch {}
      router.push(destination);
      router.refresh();
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">A</div>
        <div className="login-title">Agency ERP</div>
        <div className="login-sub">Đăng nhập vào hệ thống quản trị</div>
        {err && <div className="login-err" role="alert" aria-live="polite">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="ban@congty.vn" />
          </div>
          <div className="field">
            <label htmlFor="login-password">Mật khẩu</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          <div className="field">
            <label htmlFor="login-otp">Mã 2FA (bỏ trống nếu chưa bật)</label>
            <input id="login-otp" name="otp" type="text" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} placeholder="000000" autoComplete="one-time-code" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px' }} disabled={busy} aria-busy={busy || undefined}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
