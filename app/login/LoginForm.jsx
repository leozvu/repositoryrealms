'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { preferredWorkspaceSurface } from '@/lib/collaboration';
import { LanguageSwitch } from '@/components/LanguageProvider';

const DEMO_ROLE_EMAILS = Object.freeze({
  director: 'giamdoc@agency.vn', pm: 'pm@agency.vn', am: 'am@agency.vn', accountant: 'ketoan@agency.vn',
  hr: 'hr@agency.vn', lead: 'truongnhom@agency.vn', staff: 'nhanvien@agency.vn', freelancer: 'freelancer@agency.vn',
});

export default function LoginForm({ brand, ceoPortal = false }) {
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

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setErr('');
    if (recoveryMode && ceoPortal) {
      const response = await fetch('/api/ceo/v1/identity/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, recoveryCode, deviceLabel, reactivate: true, confirmation: 'RESTORE CEO PORTAL' }),
      }).catch(() => null);
      const body = response ? await response.json().catch(() => ({})) : {};
      setBusy(false);
      if (!response?.ok) { setErr(body.error || 'Không thể khôi phục phiên CEO'); return; }
      window.location.assign('/ceo-security');
      return;
    }

    const result = await signIn('credentials', { email, password, otp, redirect: false });
    if (result?.error) { setBusy(false); setErr('Email, mật khẩu hoặc mã 2FA không đúng'); return; }

    // The local NextAuth session and the cross-company CEO control-plane session
    // are deliberately separate. A fresh CEO login must bootstrap both in one
    // atomic user journey; otherwise the overview opens but every signed entity
    // deep link fails with ceo_sso_session_invalid until a stale cookie happens
    // to exist in that browser.
    if (ceoPortal) {
      const identityResponse = await fetch('/api/ceo/v1/identity/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, deviceLabel: 'CEO Terminal browser' }),
      }).catch(() => null);
      const identity = identityResponse ? await identityResponse.json().catch(() => ({})) : {};
      if (!identityResponse?.ok || identity.session?.stepUp !== true) {
        setBusy(false);
        setErr(identity.error || 'Không thể kích hoạt phiên điều hành đa công ty');
        return;
      }
    }

    setBusy(false);

    let destination = ceoPortal ? '/ceo-overview' : '/dashboard';
    if (!ceoPortal) {
      try {
        const pilotResponse = await fetch('/api/realm-demo/pilot', { cache: 'no-store' });
        const pilot = await pilotResponse.json();
        const resolvedSurface = pilot.user?.preference === 'auto' ? preferredWorkspaceSurface() : pilot.user?.resolvedSurface;
        if (pilotResponse.ok && pilot.user?.allowed && resolvedSurface === 'realm') destination = '/realm';
      } catch {}
    }
    window.location.assign(destination);
  };

  return (
    <div className="login-wrap" data-deployment-kind={ceoPortal ? 'ceo-portal' : 'entity'}>
      <div className="login-language-switch"><LanguageSwitch /></div>
      <main className="login-card" aria-labelledby="login-title">
        <div className="login-logo" aria-hidden="true">{brand.logoLetter}</div>
        {ceoPortal && <div className="login-context">LEOZ GROUP · CONTROL PLANE</div>}
        <h1 className="login-title" id="login-title">{ceoPortal ? `${brand.company} — ${brand.product}` : 'Agency ERP'}</h1>
        <p className="login-sub">{ceoPortal ? brand.subtitle : 'Đăng nhập vào hệ thống quản trị'}</p>
        {ceoPortal && <div className="ceo-login-scope" aria-label="Phạm vi CEO Terminal">
          <span>AIm Agency</span><span>Egoric Agency · Egolive</span><span>Vnecom LLC</span>
        </div>}
        {err && <div className="login-err" role="alert" aria-live="polite">{err}</div>}
        <form method="post" action="/login" onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus placeholder="ban@congty.vn" />
          </div>
          <div className="field">
            <label htmlFor="login-password">Mật khẩu</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="••••••••" />
          </div>
          <div className="field">
            <label htmlFor="login-otp">Mã 2FA (bỏ trống nếu chưa bật)</label>
            <input id="login-otp" name="otp" type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="000000" autoComplete="one-time-code" />
          </div>
          {recoveryMode && <>
            <div className="field">
              <label htmlFor="login-recovery-code">CEO recovery code</label>
              <input id="login-recovery-code" name="recoveryCode" type="text" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())} placeholder="RR-XXXX-XXXX-XXXX" autoComplete="one-time-code" required />
            </div>
            <div className="field">
              <label htmlFor="login-recovery-device">Tên thiết bị khôi phục</label>
              <input id="login-recovery-device" name="deviceLabel" type="text" value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} maxLength={80} autoComplete="off" required />
            </div>
          </>}
          <button className="btn btn-primary login-submit" disabled={!hydrated || busy} aria-busy={busy || undefined}>
            {!hydrated ? 'Đang khởi tạo…' : busy ? 'Đang đăng nhập…' : recoveryMode ? 'Khôi phục phiên CEO' : 'Đăng nhập'}
          </button>
          {ceoPortal && <button type="button" className="btn btn-outline login-recovery-toggle" onClick={() => { setRecoveryMode((value) => !value); setErr(''); }} disabled={busy}>
            {recoveryMode ? 'Quay lại đăng nhập TOTP' : 'CEO mất thiết bị TOTP? Dùng recovery code'}
          </button>}
        </form>
      </main>
    </div>
  );
}
