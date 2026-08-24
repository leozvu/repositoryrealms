'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui';
import { realmWorkSessionProgress } from '@/lib/realm-cooperation';
import styles from './realm-cooperation.module.css';

const PHASE_COPY = {
  forming: { label: 'Tập hợp', detail: 'Chốt mục tiêu và sẵn sàng' },
  focus: { label: 'Đang làm', detail: 'Giữ một mục tiêu chung' },
  review: { label: 'Review', detail: 'Ghi quyết định và bàn giao' },
};

const NOTE_COPY = {
  note: { label: 'Ghi chú', icon: 'edit' },
  blocker: { label: 'Blocker', icon: 'alert' },
  decision: { label: 'Quyết định', icon: 'check' },
};

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase() || 'RR';
}

function elapsedLabel(startedAt, now) {
  if (!startedAt || !now) return '00:00';
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function MemberMarks({ session, selfId, compact = false }) {
  return (
    <div className={styles.memberMarks} aria-label="Thành viên trong phiên">
      {session.members.map((member) => (
        <span
          key={member.id}
          className={member.ready ? styles.memberReady : ''}
          title={`${member.profile.name} · ${member.ready ? 'sẵn sàng' : 'chưa sẵn sàng'}`}
          style={{ '--member-color': member.profile.color }}
        >
          {initials(member.profile.name)}
          {member.id === session.hostId && <i>F</i>}
          {member.ready && <b><Icon name="check" size={9} /></b>}
          {!compact && <small>{member.id === selfId ? 'Bạn' : member.profile.name}</small>}
        </span>
      ))}
    </div>
  );
}

export function RealmCooperationHud({
  session,
  selfId,
  onReady,
  onRally,
  onOpen,
  onOpenWork,
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!session) return null;
  const self = session.members.find((member) => member.id === selfId);
  const progress = realmWorkSessionProgress(session);
  const phase = PHASE_COPY[session.phase] || PHASE_COPY.forming;

  return (
    <aside className={styles.hud} aria-label="Phiên phối hợp đang hoạt động" data-realm-work-session={session.id}>
      <div className={styles.hudSignal}><span /><span /><span /></div>
      <div className={styles.hudHead}>
        <span><i />Guild Work Session · {phase.label}</span>
        <b>{session.phase === 'focus' ? elapsedLabel(session.focusStartedAt, now) : `${progress.ready}/${progress.members} sẵn sàng`}</b>
      </div>
      <button type="button" className={styles.hudObjective} onClick={onOpen}>
        <strong data-no-i18n>{session.work.title}</strong>
        <small data-no-i18n>{session.work.context || 'Công việc đang phối hợp'}</small>
      </button>
      <MemberMarks session={session} selfId={selfId} compact />
      <div className={styles.hudActions}>
        <button type="button" data-active={self?.ready || undefined} onClick={() => onReady(!self?.ready)}><Icon name="check" size={14} />{self?.ready ? 'Đã sẵn sàng' : 'Sẵn sàng'}</button>
        <button type="button" onClick={onRally}><Icon name="map" size={14} />Tới điểm hẹn</button>
        <button type="button" onClick={onOpenWork}><Icon name="work" size={14} />Mở việc</button>
      </div>
    </aside>
  );
}

export function RealmCooperationPanel({
  party,
  session,
  selfId,
  candidate,
  onStart,
  onReady,
  onPhase,
  onAgenda,
  onNote,
  onRally,
  onOpenWork,
  onPublishNote,
  onFinish,
}) {
  const [noteKind, setNoteKind] = useState('note');
  const [noteText, setNoteText] = useState('');
  const [now, setNow] = useState(0);
  const [publishingId, setPublishingId] = useState('');
  const [publishedIds, setPublishedIds] = useState(() => new Set());
  const progress = useMemo(() => realmWorkSessionProgress(session), [session]);

  useEffect(() => {
    if (!session?.focusStartedAt) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.focusStartedAt]);

  useEffect(() => {
    setPublishingId('');
    setPublishedIds(new Set());
  }, [session?.id]);

  if (!party) return (
    <section className={styles.empty} aria-label="Guild Work Session">
      <span><Icon name="people" size={25} /></span>
      <h3>Làm việc cùng nhau, ngay trong Realm</h3>
      <p>Mời ít nhất một đồng đội vào Party Voice. Party sẽ trở thành nhóm làm việc có cùng Task, điểm hẹn, agenda và nhật ký quyết định.</p>
      <small>Phiên phối hợp không tự thay đổi Task, Gold hoặc phê duyệt trong ERP.</small>
    </section>
  );

  if (!session) return (
    <section className={styles.prepare} aria-label="Chuẩn bị phiên phối hợp">
      <div className={styles.prepareSeal}><Icon name="work" size={24} /></div>
      <div className={styles.prepareCopy}>
        <span>Party đã sẵn sàng · {party.members.length} thành viên</span>
        <h3 data-no-i18n>{candidate?.work.title || 'Chọn một Task để phối hợp'}</h3>
        <p data-no-i18n>{candidate?.work.context || 'Mở Quest Board và chọn công việc thật từ ERP.'}</p>
      </div>
      <MemberMarks session={{ members: party.members.map((member) => ({ ...member, ready: false })), hostId: party.hostId }} selfId={selfId} />
      {party.hostId === selfId ? (
        <button type="button" className={styles.primary} disabled={!candidate} onClick={() => onStart(candidate)}><Icon name="people" size={16} />Mở phiên phối hợp</button>
      ) : (
        <div className={styles.waiting}><i /><span><strong>Đang chờ facilitator</strong><small>Host chọn Task và mở phiên cho cả Party.</small></span></div>
      )}
    </section>
  );

  const self = session.members.find((member) => member.id === selfId);
  const phase = PHASE_COPY[session.phase] || PHASE_COPY.forming;
  const submitNote = (event) => {
    event.preventDefault();
    const text = noteText.trim();
    if (!text) return;
    if (onNote(noteKind, text) !== false) setNoteText('');
  };
  const publishNote = async (note) => {
    if (!onPublishNote || publishingId) return;
    setPublishingId(note.id);
    try {
      const published = await onPublishNote(note);
      if (published !== false) setPublishedIds((current) => new Set([...current, note.id]));
    } finally {
      setPublishingId('');
    }
  };

  return (
    <section className={styles.panel} aria-label="Guild Work Session đang hoạt động" data-realm-work-session={session.id}>
      <header className={styles.sessionHeader}>
        <div>
          <span><i />Guild Work Session · {phase.label}</span>
          <h3 data-no-i18n>{session.work.title}</h3>
          <p data-no-i18n>{session.work.context}</p>
        </div>
        <strong>{session.phase === 'focus' ? elapsedLabel(session.focusStartedAt, now) : `${progress.done}/${progress.agenda}`}</strong>
      </header>

      <div className={styles.phaseRail} aria-label="Nhịp phiên phối hợp">
        {Object.entries(PHASE_COPY).map(([value, copy], index) => (
          <button
            type="button"
            key={value}
            data-active={session.phase === value || undefined}
            disabled={session.hostId !== selfId}
            onClick={() => onPhase(value)}
          >
            <i>{index + 1}</i><span><strong>{copy.label}</strong><small>{copy.detail}</small></span>
          </button>
        ))}
      </div>

      <div className={styles.sessionToolbar}>
        <button type="button" data-active={self?.ready || undefined} onClick={() => onReady(!self?.ready)}><Icon name="check" size={15} />{self?.ready ? 'Tôi đã sẵn sàng' : 'Đánh dấu sẵn sàng'}</button>
        <button type="button" onClick={onRally}><Icon name="map" size={15} />Tới điểm hẹn</button>
        <button type="button" onClick={onOpenWork}><Icon name="work" size={15} />Mở Task</button>
      </div>

      <MemberMarks session={session} selfId={selfId} />

      <div className={styles.workGrid}>
        <section className={styles.agenda} aria-labelledby="work-session-agenda">
          <header><span>Shared agenda</span><strong id="work-session-agenda">Cùng một định nghĩa hoàn thành</strong></header>
          <ol>
            {session.agenda.map((item) => (
              <li key={item.id} data-done={item.done || undefined}>
                <button type="button" onClick={() => onAgenda(item.id)} aria-pressed={item.done}>
                  <i>{item.done ? <Icon name="check" size={13} /> : ''}</i>
                  <span data-no-i18n>{item.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.log} aria-labelledby="work-session-log">
          <header><span>Shared log</span><strong id="work-session-log">Blocker và quyết định</strong></header>
          <div className={styles.logEntries} aria-live="polite">
            {!session.notes.length && <p>Chưa có ghi chú. Ghi blocker ngay khi xuất hiện; quyết định sẽ ở lại trong phiên để mọi người cùng thấy.</p>}
            {session.notes.map((note) => (
              <article key={note.id} data-kind={note.kind}>
                <span><Icon name={NOTE_COPY[note.kind]?.icon || 'edit'} size={13} />{NOTE_COPY[note.kind]?.label || 'Ghi chú'}</span>
                <p data-no-i18n>{note.text}</p>
                <small><b data-no-i18n>{note.authorName}</b> · {new Date(note.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small>
                {onPublishNote && <button type="button" className={styles.publishNote} disabled={publishingId === note.id || publishedIds.has(note.id)} onClick={() => publishNote(note)}><Icon name={publishedIds.has(note.id) ? 'check' : 'link'} size={12} />{publishedIds.has(note.id) ? 'Đã ghi vào Task' : publishingId === note.id ? 'Đang ghi…' : 'Ghi vào Task ERP'}</button>}
              </article>
            ))}
          </div>
          <form className={styles.composer} onSubmit={submitNote}>
            <label htmlFor="work-session-note">Thêm vào shared log</label>
            <div className={styles.noteKinds}>
              {Object.entries(NOTE_COPY).map(([value, copy]) => <button type="button" key={value} data-active={noteKind === value || undefined} onClick={() => setNoteKind(value)}>{copy.label}</button>)}
            </div>
            <div><input id="work-session-note" maxLength={240} value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Ghi blocker, quyết định hoặc ngữ cảnh…" /><button type="submit" disabled={!noteText.trim()} aria-label="Gửi vào shared log"><Icon name="check" size={15} /></button></div>
          </form>
        </section>
      </div>

      <footer className={styles.guardrail}>
        <span><Icon name="shield" size={15} /></span>
        <p>Phiên này điều phối con người và ngữ cảnh. Task, approval và Gold chỉ thay đổi qua workflow ERP có biên nhận.</p>
        {session.hostId === selfId && <button type="button" onClick={onFinish}>Khép phiên</button>}
      </footer>
    </section>
  );
}
