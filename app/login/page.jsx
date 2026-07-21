'use client';
import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { preferredWorkspaceSurface } from '@/lib/collaboration';
import { LanguageSwitch } from '@/components/LanguageProvider';

const DEMO_ROLE_EMAILS = Object.freeze({
  director: 'giamdoc@agency.vn',
  pm: 'pm@agency.vn',
  am: 'am@agency.vn',
  accountant: 'ketoan@agency.vn',
  hr: 'hr@agency.vn',
  lead: 'truongnhom@agency.vn',
  staff: 'nhanvien@agency.vn',
  freelancer: 'freelancer@agency.vn',
});

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('CEO recovery browser');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => {
    const selectedRole = new URLSearchParams(window.location.search).get('role')?.trim().toLowerCase();
    if (selectedRole && DEMO_ROLE_EMAILS[selectedRole]) setEmail(DEMO_ROLE_EMAILS[selectedRole]);
  }, []);

  const submit = async e => {
    e.preventDefault();
    setBusy(true); setErr('');
    if (recoveryMode) {
      const response = await fetch('/api/ceo/v1/identity/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, recoveryCode, deviceLabel }),
      }).catch(() => null);
      const body = response ? await response.json().catch(() => ({})) : {};
      setBusy(false);
      if (!response?.ok) { setErr(body.error || 'Không thể khôi phục phiên CEO'); return; }
      window.location.assign('/ceo-registry');
      return;
    }
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
      // A credentials callback can legitimately resolve to /login even after the
      // secure session cookie was issued. A hard same-origin navigation guarantees
      // every browser leaves the credential form with that shared ERP/Realm session.
      window.location.assign(destination);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-language-switch"><LanguageSwitch /></div>
      <div className="login-card">
        <div className="login-logo">A</div>
        <div className="login-title">Agency ERP</div>
        <div className="login-sub">Đăng nhập vào hệ thống quản trị</div>
        {err && <div className="login-err" role="alert" aria-live="polite">{err}</div>}
        <form method="post" action="/login" onSubmit={submit}>
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
          {recoveryMode && <>
            <div className="field">
              <label htmlFor="login-recovery-code">CEO recovery code</label>
              <input id="login-recovery-code" name="recoveryCode" type="text" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value.toUpperCase())} placeholder="RR-XXXX-XXXX-XXXX" autoComplete="one-time-code" required />
            </div>
            <div className="field">
              <label htmlFor="login-recovery-device">Tên thiết bị khôi phục</label>
              <input id="login-recovery-device" name="deviceLabel" type="text" value={deviceLabel} onChange={e => setDeviceLabel(e.target.value)} maxLength={80} autoComplete="off" required />
            </div>
          </>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px' }} disabled={!hydrated || busy} aria-busy={busy || undefined}>
            {!hydrated ? 'Đang khởi tạo…' : busy ? 'Đang đăng nhập…' : recoveryMode ? 'Khôi phục phiên CEO' : 'Đăng nhập'}
          </button>
          <button type="button" className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => { setRecoveryMode((value) => !value); setErr(''); }} disabled={busy}>
            {recoveryMode ? 'Quay lại đăng nhập TOTP' : 'CEO mất thiết bị TOTP? Dùng recovery code'}
          </button>
        </form>
      </div>
    </div>
  );
}
