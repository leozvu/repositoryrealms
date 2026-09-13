/** Browser resource lifecycle. No business retries: an uncertain write must be
 * reconciled by its caller, never automatically submitted a second time. */
export function createResourceClient({ url, fetcher = (...args) => fetch(...args), decodeRead, onState, onInflight = () => {}, onMessage = () => {} }) {
  let disposed = false, read = null, sequence = 0, mutation = null;
  const publish = patch => { if (!disposed) onState(patch); };
  const message = text => { if (!disposed) onMessage(text); };
  const errorMessage = (response, body) => response.status === 401
    ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
    : response.status === 403 ? 'Bạn không còn quyền xem dữ liệu này.'
      : typeof body?.error === 'string' ? body.error : 'Không thể tải dữ liệu. Hãy thử lại.';

  function cancelRead() {
    if (!read) return;
    read.controller.abort(); read.release(); read = null;
  }

  async function refresh() {
    if (disposed) return null;
    cancelRead();
    const id = ++sequence, controller = new AbortController();
    let released = false;
    const release = () => { if (!released) { released = true; onInflight(-1); } };
    read = { id, controller, release }; onInflight(1);
    const current = () => !disposed && read?.id === id;
    publish({ loading: true, error: '', forbidden: false });
    try {
      const response = await fetcher(url, { signal: controller.signal, cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!current()) return null;
      if (!response.ok) {
        publish({ rows: [], metadata: null, forbidden: response.status === 403, error: errorMessage(response, body) });
        return null;
      }
      const decoded = decodeRead ? decodeRead(body) : { rows: body };
      if (!Array.isArray(decoded?.rows)) throw new Error('invalid_resource_response');
      publish({ rows: decoded.rows, metadata: decoded.metadata ?? null, error: '', forbidden: false, updatedAt: Date.now() });
      return decoded.rows;
    } catch {
      if (current()) publish({ rows: [], metadata: null, forbidden: false, error: 'Không thể tải dữ liệu. Kiểm tra kết nối và thử lại.' });
      return null;
    } finally {
      release();
      if (current()) { read = null; publish({ loading: false }); }
    }
  }

  function call(method, target, body) {
    if (disposed) return Promise.resolve(null);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const signature = JSON.stringify([method, target, payload]);
    if (mutation) {
      if (mutation.signature === signature) return mutation.promise;
      message('Một thao tác đang được xử lý. Hãy đợi kết quả trước khi tiếp tục.');
      return Promise.resolve(null);
    }
    publish({ mutating: true });
    // Defer invocation until the lock is installed, even with a synchronous fetch stub.
    const promise = Promise.resolve().then(async () => {
      try {
        const response = await fetcher(target, { method, headers: { 'Content-Type': 'application/json' }, body: payload });
        const result = response.status === 204 ? { ok: true } : await response.json().catch(() => null);
        if (!response.ok) {
          message(typeof result?.error === 'string' ? result.error : response.status === 409
            ? 'Dữ liệu đã thay đổi. Tải lại bản ghi và kiểm tra trước khi lưu.' : 'Không thể hoàn tất thao tác.');
          return null;
        }
        if (!result || typeof result !== 'object') {
          message('Chưa xác minh được kết quả. Hãy tải lại dữ liệu trước khi thử thao tác lần nữa.');
          return null;
        }
        if (result._blocked) {
          message(typeof result._notice === 'string' ? result._notice : 'Thao tác cần được phê duyệt; dữ liệu chưa được thay đổi.');
          return null;
        }
        // A successful write stays successful even when its subsequent GET fails.
        // Preserve the result so callers cannot accidentally create a duplicate.
        const rows = await refresh();
        if (rows === null && !disposed) message('Đã lưu trên máy chủ, nhưng chưa tải lại được danh sách. Hãy bấm Thử tải lại.');
        return disposed ? null : result;
      } catch {
        message('Kết nối bị gián đoạn; chưa xác minh được kết quả. Hãy tải lại dữ liệu trước khi thử thao tác lần nữa.');
        return null;
      } finally {
        mutation = null; publish({ mutating: false });
      }
    });
    mutation = { signature, promise };
    return promise;
  }

  return { refresh, call, dispose() { disposed = true; cancelRead(); } };
}
