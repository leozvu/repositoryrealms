'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AsyncButton, Icon, Modal, useToast } from '@/components/ui';
import styles from './realm-feedback-operations.module.css';

const STATUS = {
  open: ['Đã tiếp nhận', 'b-red'],
  in_progress: ['Đang xử lý', 'b-blue'],
  waiting: ['Đang chờ', 'b-amber'],
  resolved: ['Đã xử lý', 'b-green'],
  closed: ['Đã đóng', 'b-gray'],
};

const TYPE = { bug: 'Lỗi kỹ thuật', friction: 'Khó sử dụng', idea: 'Ý tưởng', support: 'Cần hỗ trợ' };
const SURFACE = { realm: 'Realm', erp: 'ERP · CRM' };
const PRIORITY = { high: 'Cao · SLA 8h', normal: 'Thường · SLA 24h', low: 'Thấp · SLA 72h' };

function Metric({ value, label, detail }) {
  return <div className={styles.metric}><strong>{value || 0}</strong><span>{label}</span>{detail && <small>{detail}</small>}</div>;
}

export default function RealmFeedbackOperations() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: '', overview: null });
  const [filter, setFilter] = useState('unresolved');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch('/api/realm-demo/feedback', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể tải Guild Support.');
      setState({ loading: false, error: '', overview: payload });
      const focus = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('realmFeedback') : null;
      const row = focus ? payload.rows?.find((item) => item.id === focus) : null;
      if (row) openEditor(row);
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || 'Không thể tải Guild Support.' }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEditor = (row) => {
    setSelected(row);
    setDraft({ status: row.status, priority: row.priority, assigneeId: row.assigneeId || '', response: row.response || '' });
  };

  const save = async () => {
    const response = await fetch('/api/realm-demo/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, expectedUpdatedAt: selected.updatedAt, ...draft }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409) await load();
      toast(payload.error || 'Không thể cập nhật phản hồi.', 'error');
      return false;
    }
    setState({ loading: false, error: '', overview: payload.overview });
    setSelected(null);
    setDraft(null);
    toast(`Đã cập nhật ${payload.feedback.code}. Người gửi sẽ nhận thông báo.`);
    return true;
  };

  const overview = state.overview;
  const rows = useMemo(() => (overview?.rows || []).filter((row) => {
    if (filter === 'all') return true;
    if (filter === 'resolved') return ['resolved', 'closed'].includes(row.status);
    return !['resolved', 'closed'].includes(row.status);
  }), [filter, overview]);

  return (
    <section className={`card ${styles.card}`} aria-labelledby="realm-feedback-operations-title">
      <div className={`card-head ${styles.header}`}>
        <span className={styles.icon}><Icon name="note" size={18} /></span>
        <div>
          <span className="card-title" id="realm-feedback-operations-title">Guild Support · Pilot Operations</span>
          <p>Phản hồi Realm trở thành Ticket ERP và có SLA, người xử lý, audit cùng thông báo trạng thái.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={state.loading}><Icon name="repeat" size={14} /> Tải lại</button>
      </div>

      <div className={`card-body ${styles.body}`}>
        {state.loading ? (
          <div className={styles.loading} aria-live="polite" aria-busy="true">Đang tải Guild Support…</div>
        ) : state.error ? (
          <div className={styles.error} role="alert"><span>{state.error}</span><button type="button" className="btn btn-outline btn-sm" onClick={load}>Thử lại</button></div>
        ) : (
          <>
            <div className={styles.metrics} aria-label="Tổng hợp phản hồi pilot">
              <Metric value={overview.metrics.total} label="Tổng phản hồi" />
              <Metric value={overview.metrics.unresolved} label="Chưa hoàn tất" />
              <Metric value={overview.metrics.blocked} label="Đang bị chặn" />
              <Metric value={overview.metrics.bySurface.realm} label="Từ Realm" detail={`${overview.metrics.bySurface.erp || 0} từ ERP`} />
            </div>

            <div className={styles.toolbar}>
              <div><strong>Hàng chờ xử lý</strong><span>Không dùng số phản hồi để đánh giá cá nhân.</span></div>
              <label><span>Hiển thị</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="unresolved">Chưa hoàn tất</option><option value="resolved">Đã hoàn tất</option><option value="all">Tất cả</option></select></label>
            </div>

            <div className={styles.queue}>
              {rows.map((row) => {
                const [statusLabel, statusClass] = STATUS[row.status] || [row.status, 'b-gray'];
                return (
                  <button type="button" key={row.id} className={styles.row} onClick={() => openEditor(row)}>
                    <span className={styles.rowCode}>{row.code}<small>{SURFACE[row.surface]} · {row.context.area}</small></span>
                    <span className={styles.rowCopy}><strong>{row.summary}</strong><small>{TYPE[row.category]} · gửi bởi {row.reporter?.name || 'Nhân sự'}</small></span>
                    <span className={`badge ${statusClass}`}><span className="dot" />{statusLabel}</span>
                  </button>
                );
              })}
              {!rows.length && <div className={styles.empty}><Icon name="check" size={20} /><strong>Không có phản hồi trong bộ lọc này</strong><span>Hàng chờ pilot hiện đã được xử lý.</span></div>}
            </div>

            <p className={styles.privacy}><Icon name="shield" size={15} /> Chỉ lưu context đã công bố trong form. Không thu nội dung record, lịch sử duyệt, phím bấm hoặc thời lượng làm việc.</p>
          </>
        )}
      </div>

      {selected && draft && (
        <Modal title={`${selected.code} · ${TYPE[selected.category]}`} onClose={() => { setSelected(null); setDraft(null); }}>
          <div className={styles.detail}>
            <div className={styles.detailMeta}><span><b>Người gửi</b>{selected.reporter?.name || 'Nhân sự'}</span><span><b>Bề mặt</b>{SURFACE[selected.surface]}</span><span><b>Khu vực</b>{selected.context.area}</span><span><b>Phiên bản</b>{selected.context.release || 'local'}</span></div>
            <div className={styles.report}><strong>{selected.summary}</strong><p>{selected.details}</p></div>
            <div className={styles.editorGrid}>
              <label><span>Trạng thái</span><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>{Object.entries(STATUS).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>Ưu tiên</span><select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}>{Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className={styles.full}><span>Người xử lý</span><select value={draft.assigneeId} onChange={(event) => setDraft((current) => ({ ...current, assigneeId: event.target.value }))}><option value="">Chưa gán</option>{(overview?.handlers || []).map((handler) => <option key={handler.id} value={handler.id}>{handler.name}</option>)}</select></label>
              <label className={styles.full}><span>Phản hồi cho người gửi</span><textarea rows={4} maxLength={1000} value={draft.response} onChange={(event) => setDraft((current) => ({ ...current, response: event.target.value }))} /><small>Phản hồi này xuất hiện trong Ticket và thông báo của người gửi.</small></label>
            </div>
            <div className={styles.modalActions}><button type="button" className="btn btn-outline" onClick={() => { setSelected(null); setDraft(null); }}>Hủy</button><AsyncButton type="button" className="btn btn-primary" pendingLabel="Đang lưu…" onClick={save}>Lưu &amp; thông báo</AsyncButton></div>
          </div>
        </Modal>
      )}
    </section>
  );
}
