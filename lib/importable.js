// v3.28: NHẬP LIỆU HÀNG LOẠT — khai báo resource nào cho phép import + cột của nó.
// Chỉ whitelist tài nguyên "danh sách" an toàn (KHÔNG cho import users/payouts/… nhạy cảm).
// validateRow() thuần để test được; server dùng lại đúng luồng canWrite/beforeCreate/validate.

export const IMPORTABLE = {
  clients: {
    label: 'Khách hàng', mod: null,
    fields: [
      { key: 'name', label: 'Tên khách hàng', required: true },
      { key: 'contact', label: 'Người liên hệ' },
      { key: 'phone', label: 'Điện thoại' },
      { key: 'email', label: 'Email' },
      { key: 'industry', label: 'Ngành nghề' },
      { key: 'address', label: 'Địa chỉ' },
      { key: 'note', label: 'Ghi chú' },
    ],
  },
  leads: {
    label: 'Khách tiềm năng', mod: 'sales',
    fields: [
      { key: 'name', label: 'Tên', required: true },
      { key: 'company', label: 'Công ty' },
      { key: 'phone', label: 'Điện thoại' },
      { key: 'email', label: 'Email' },
      { key: 'source', label: 'Nguồn' },
      { key: 'value', label: 'Giá trị (đ)', type: 'int' },
      { key: 'stage', label: 'Giai đoạn', type: 'enum', options: ['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'] },
      { key: 'note', label: 'Ghi chú' },
    ],
  },
  vendors: {
    label: 'Nhà cung cấp', mod: 'procurement',
    fields: [
      { key: 'name', label: 'Tên NCC', required: true },
      { key: 'type', label: 'Loại' },
      { key: 'contact', label: 'Liên hệ' },
      { key: 'phone', label: 'Điện thoại' },
      { key: 'email', label: 'Email' },
      { key: 'note', label: 'Ghi chú' },
    ],
  },
  services: {
    label: 'Bảng giá dịch vụ', mod: 'services',
    fields: [
      { key: 'name', label: 'Tên dịch vụ', required: true },
      { key: 'unit', label: 'Đơn vị' },
      { key: 'price', label: 'Đơn giá (đ)', type: 'int' },
      { key: 'desc', label: 'Mô tả' },
    ],
  },
  transactions: {
    label: 'Thu / Chi', mod: null,
    fields: [
      { key: 'type', label: 'Loại (income=thu, expense=chi)', type: 'enum', options: ['income', 'expense'], required: true },
      { key: 'category', label: 'Danh mục' },
      { key: 'amount', label: 'Số tiền (đ)', type: 'int', required: true },
      { key: 'date', label: 'Ngày (YYYY-MM-DD)', type: 'date', required: true },
      { key: 'desc', label: 'Diễn giải' },
    ],
  },
};

// Số nguyên tiền VND: bỏ mọi ký tự trừ chữ số và dấu âm ("1.000.000" / "1,000,000₫" → 1000000).
export function parseIntVnd(v) {
  const s = String(v ?? '').replace(/[^\d-]/g, '');
  if (!s || s === '-') return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

// Kiểm + ép kiểu một dòng thô { key: rawString }. Trả { data, errors[] }.
export function validateRow(raw, fields) {
  const data = {};
  const errors = [];
  for (const f of fields) {
    let v = raw[f.key];
    v = v == null ? '' : String(v).trim();
    if (!v) {
      if (f.required) errors.push(`Thiếu "${f.label}"`);
      continue; // ô trống, không bắt buộc → bỏ qua (để null/mặc định)
    }
    if (f.type === 'int') {
      const n = parseIntVnd(v);
      if (n == null) { errors.push(`"${f.label}" không phải số: "${v}"`); continue; }
      data[f.key] = n;
    } else if (f.type === 'enum') {
      const low = v.toLowerCase();
      const match = f.options.find(o => o.toLowerCase() === low);
      if (!match) { errors.push(`"${f.label}" phải là một trong: ${f.options.join(', ')} (đang là "${v}")`); continue; }
      data[f.key] = match;
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { errors.push(`"${f.label}" phải dạng YYYY-MM-DD (đang là "${v}")`); continue; }
      data[f.key] = v;
    } else {
      data[f.key] = v;
    }
  }
  return { data, errors };
}

// Tách văn bản dán từ Excel/Sheets (TSV) hoặc CSV đơn giản thành mảng ô. Ưu tiên TAB (dán Excel),
// nếu không có TAB thì tách theo dấu phẩy (CSV đơn giản — không xử lý dấu phẩy trong ngoặc kép).
export function splitRows(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() !== '');
  const sep = lines.some(l => l.includes('\t')) ? '\t' : ',';
  return lines.map(l => l.split(sep).map(c => c.trim()));
}

// v3.29: xuất mảng bản ghi ra CSV (mở được bằng Excel). Có BOM UTF-8 để Excel hiện đúng tiếng Việt.
const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCSV(rows, fields) {
  const head = fields.map(f => csvCell(f.label)).join(',');
  const body = rows.map(r => fields.map(f => csvCell(f.get ? f.get(r) : r[f.key])).join(',')).join('\n');
  return '﻿' + head + '\n' + body; // BOM + nội dung
}

// v3.35: các nguồn CHỈ XUẤT (không nhập round-trip) — hóa đơn, lô hàng… với cột tính sẵn.
const invTotal = v => { try { const it = JSON.parse(v.items || '[]'); return Math.round(it.reduce((s, x) => s + (+x.qty || 0) * (+x.price || 0), 0) * (1 + (+v.vat || 0) / 100)); } catch { return 0; } };
const invPaid = v => { try { return JSON.parse(v.payments || '[]').reduce((s, p) => s + (+p.amount || 0), 0); } catch { return 0; } };
export const EXPORT_ONLY = {
  invoices: {
    label: 'Hóa đơn', mod: null,
    fields: [
      { key: 'code', label: 'Số hóa đơn' },
      { key: 'date', label: 'Ngày' },
      { key: 'dueDate', label: 'Hạn thanh toán' },
      { key: 'status', label: 'Trạng thái' },
      { key: 'currency', label: 'Tiền tệ' },
      { label: 'Tổng tiền (gồm VAT)', get: invTotal },
      { label: 'Đã thu', get: invPaid },
      { label: 'Còn lại', get: v => Math.max(0, invTotal(v) - invPaid(v)) },
    ],
  },
  shipments: {
    label: 'Lô hàng xuất', mod: 'export',
    fields: [
      { key: 'code', label: 'Mã lô' }, { key: 'crop', label: 'Mặt hàng' }, { key: 'market', label: 'Thị trường' },
      { key: 'currency', label: 'Tiền tệ' }, { key: 'amount', label: 'Giá trị' }, { key: 'incoterm', label: 'Incoterm' },
      { key: 'paymentMethod', label: 'Thanh toán' }, { key: 'status', label: 'Trạng thái' },
      { key: 'etd', label: 'ETD' }, { key: 'eta', label: 'ETA' }, { key: 'blNo', label: 'Số B/L' },
    ],
  },
};
