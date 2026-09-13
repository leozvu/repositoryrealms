export function decodeLeadBoard(body) {
  if (!body?.summary || !body?.columns || !Number.isFinite(body.summary.total)) throw new Error('invalid_lead_board');
  const stages = ['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];
  const columns = stages.map(stage => body.columns[stage]);
  if (columns.some((column, index) => !Array.isArray(column?.rows) || typeof column?.page?.hasMore !== 'boolean'
    || column.rows.some(row => !row || typeof row.id !== 'string' || !row.id || row.stage !== stages[index])
    || (column.page.hasMore && (typeof column.page.nextCursor !== 'string' || !column.page.nextCursor))
    || (!column.page.hasMore && column.page.nextCursor !== null))) throw new Error('invalid_lead_columns');
  return { rows: columns.flatMap(column => column.rows), metadata: body };
}

export function leadCsv(rows, userName = id => id || '') {
  if (!Array.isArray(rows)) throw new Error('Không thể xác minh dữ liệu xuất.');
  const columns = [
    ['Deal', row => row.company || row.name], ['Người liên hệ', row => row.name],
    ['Giai đoạn', row => row.stage], ['Giá trị', row => row.value], ['Nguồn', row => row.source],
    ['Chiến dịch', row => row.campaign], ['Khu vực', row => row.region], ['Mảng dịch vụ', row => row.serviceLine],
    ['Dự kiến chốt', row => row.expectedClose], ['Phụ trách', row => userName(row.ownerId)],
  ];
  const cell = value => {
    let text = value == null ? '' : String(value);
    // Treat untrusted text as text when a spreadsheet opens the export.
    if (typeof value !== 'number' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\ufeff' + [columns.map(([label]) => label), ...rows.map(row => columns.map(([, value]) => value(row)))].map(line => line.map(cell).join(',')).join('\r\n');
}
