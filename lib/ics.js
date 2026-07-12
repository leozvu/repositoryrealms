// v3.3: Xuất lịch iCalendar (.ics) — Google Calendar / Apple Calendar / Outlook
// subscribe qua URL là sự kiện ERP tự đổ về, không cần OAuth.
import crypto from 'crypto';

const SECRET = process.env.NEXTAUTH_SECRET || 'dev-secret';
export const icsToken = uid => crypto.createHmac('sha256', SECRET).update('ics:' + uid).digest('hex').slice(0, 32);

const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const d8 = iso => (iso || '').slice(0, 10).replace(/-/g, ''); // YYYYMMDD
const nextDay = iso => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };

// events: [{id, date (YYYY-MM-DD), endDate?, title, desc?}] — all-day
export function buildICS(calName, events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agency ERP//VI', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:' + esc(calName), 'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
  ];
  for (const e of events) {
    if (!e.date) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@agency-erp`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d8(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay((e.endDate || e.date).slice(0, 10))}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.desc ? [`DESCRIPTION:${esc(e.desc)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
