'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

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
    else { router.push('/dashboard'); router.refresh(); }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">A</div>
        <div className="login-title">Agency ERP</div>
        <div className="login-sub">Đăng nhập vào hệ thống quản trị</div>
        {err && <div className="login-err">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="ban@congty.vn" />
          </div>
          <div className="field">
            <label>Mật khẩu</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          <div className="field">
            <label>Mã 2FA (bỏ trống nếu chưa bật)</label>
            <input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} placeholder="000000" autoComplete="one-time-code" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px' }} disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
