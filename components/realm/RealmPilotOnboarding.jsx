'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon, Modal, useToast } from '@/components/ui';
import styles from './realm-pilot-onboarding.module.css';

export const REALM_ONBOARDING_RESET_EVENT = 'realm-pilot-onboarding-reset';

const STEPS = [
  {
    icon: 'repeat',
    title: 'Một dữ liệu, hai giao diện',
    copy: 'Realm và ERP cùng dùng tài khoản, phân quyền và dữ liệu nghiệp vụ. Chuyển giao diện không tạo bản sao Task, Lead hay Ticket.',
    checks: ['ERP luôn là lối quay về an toàn', 'Trạng thái nhân vật phản ánh dữ liệu ERP hiện có'],
  },
  {
    icon: 'meeting',
    title: 'Văn phòng và liên hệ đồng đội',
    copy: 'Presence hợp nhất người đang dùng Realm lẫn ERP. Bạn có thể ghé bàn hoặc gửi Lantern Mail; người không mở Realm vẫn nhận được liên hệ.',
    checks: ['Trạng thái Không làm phiền được tôn trọng', 'Mất mạng sẽ chuyển về chế độ an toàn'],
  },
  {
    icon: 'wallet',
    title: 'Quest, Gold và Tavern',
    copy: 'Quest đến từ Task ERP. Gold chỉ phát hành sau maker–checker và Tavern dùng cùng ledger; Gold không thay thế lương hay quyền lợi bắt buộc.',
    checks: ['Không tự chấm Gold cho chính mình', 'Mọi phát hành và đổi thưởng đều có audit'],
  },
  {
    icon: 'shield',
    title: 'Luôn có đường thoát và hỗ trợ',
    copy: 'Nếu Realm gây vướng, hãy chuyển về ERP ngay và gửi Guild Support. Phản hồi trở thành Ticket ERP, không dùng để chấm hiệu suất cá nhân.',
    checks: ['Không ghi phím bấm hoặc thời lượng làm việc', 'Có thể mở lại hướng dẫn từ nút cố định'],
  },
];

function storageKey(userId, version) {
  return `crmegoric-realm-onboarding:${userId}:v${version}`;
}

export default function RealmPilotOnboarding({ user, pilot }) {
  const pathname = usePathname();
  const toast = useToast();
  const version = pilot?.config?.onboardingVersion || 1;
  const key = useMemo(() => storageKey(user?.id || 'anonymous', version), [user?.id, version]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const eligible = Boolean(user?.id && pilot?.allowed);
  const surface = pathname === '/realm' || pathname.startsWith('/realm/') ? 'realm' : 'erp';

  useEffect(() => {
    if (!eligible) {
      setOpen(false);
      setHydrated(true);
      return;
    }
    let stored = null;
    try { stored = window.localStorage.getItem(key); } catch {}
    setStep(0);
    setOpen(!stored);
    setHydrated(true);
  }, [eligible, key]);

  useEffect(() => {
    const reset = () => {
      if (!eligible) return;
      try { window.localStorage.removeItem(key); } catch {}
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(REALM_ONBOARDING_RESET_EVENT, reset);
    return () => window.removeEventListener(REALM_ONBOARDING_RESET_EVENT, reset);
  }, [eligible, key]);

  const persist = (state) => {
    try { window.localStorage.setItem(key, JSON.stringify({ state, version })); } catch {}
    setOpen(false);
    setStep(0);
    if (state === 'completed') toast('Đã hoàn tất Realm pilot tour. Bạn luôn có thể mở lại hướng dẫn.');
  };

  if (!eligible || !hydrated) return null;
  const current = STEPS[step];
  const finalStep = step === STEPS.length - 1;

  return (
    <>
      {!open && (
        <button
          type="button"
          className={styles.launcher}
          data-surface={surface}
          onClick={() => { setStep(0); setOpen(true); }}
          aria-label="Mở hướng dẫn Realm pilot"
        >
          <Icon name="shield" size={16} />
          <span>Hướng dẫn Realm</span>
        </button>
      )}
      {open && (
        <Modal
          title="Realm Pilot · Khởi hành an toàn"
          onClose={() => persist('skipped')}
          footer={(
            <div className={styles.actions}>
              <button type="button" className="btn btn-ghost" onClick={() => persist('skipped')}>Bỏ qua lúc này</button>
              <span className={styles.actionSpacer} />
              {step > 0 && <button type="button" className="btn btn-outline" onClick={() => setStep((value) => value - 1)}>Quay lại</button>}
              <button type="button" className="btn btn-primary" onClick={() => finalStep ? persist('completed') : setStep((value) => value + 1)}>
                {finalStep ? 'Hoàn tất hướng dẫn' : 'Tiếp tục'}
              </button>
            </div>
          )}
        >
          <div className={styles.tour}>
            <div className={styles.progressHeader}>
              <span>Bước {step + 1} / {STEPS.length}</span>
              <span>Onboarding v{version} · chỉ lưu trên thiết bị này</span>
            </div>
            <div className={styles.progress} aria-label={`Tiến độ hướng dẫn: bước ${step + 1} trên ${STEPS.length}`}>
              {STEPS.map((item, index) => <span key={item.title} data-active={index <= step || undefined} />)}
            </div>
            <section className={styles.step} aria-live="polite" aria-labelledby="realm-onboarding-step-title">
              <span className={styles.stepIcon}><Icon name={current.icon} size={25} /></span>
              <div>
                <h2 id="realm-onboarding-step-title">{current.title}</h2>
                <p>{current.copy}</p>
              </div>
            </section>
            <ul className={styles.checks}>
              {current.checks.map((check) => <li key={check}><Icon name="check" size={15} /><span>{check}</span></li>)}
            </ul>
            <p className={styles.privacy}><Icon name="shield" size={15} /> Tiến độ tour không gửi lên server, không đo thời lượng và không dùng để đánh giá cá nhân.</p>
          </div>
        </Modal>
      )}
    </>
  );
}
