export const csvEscape = (val: any): string => {
  if (val === null || val === undefined) return '';
  const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const rowsToCsv = (rows: Record<string, any>[]): string => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) lines.push(headers.map(h => csvEscape(r[h])).join(','));
  return lines.join('\r\n');
};

const downloadCsv = (filename: string, content: string) => {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

interface FieldMeta { field_key: string; label: string; }

export const exportFeedbackToCsv = (
  submissions: any[],
  fields: FieldMeta[],
  filename = 'feedback.csv'
) => {
  const fieldMap = new Map(fields.map(f => [f.field_key, f.label]));
  const dynamicKeys = new Set<string>();
  submissions.forEach(s => {
    if (s.responses && typeof s.responses === 'object') {
      Object.keys(s.responses).forEach(k => dynamicKeys.add(k));
    }
  });

  const orderedKeys = [
    ...fields.map(f => f.field_key).filter(k => dynamicKeys.has(k)),
    ...Array.from(dynamicKeys).filter(k => !fieldMap.has(k)),
  ];

  const rows = submissions.map((s, i) => {
    const row: Record<string, any> = {
      '#': i + 1,
      'Submitted At': s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '',
      'Mobile': s.customer_mobile ?? '',
      'Name': s.customer_name ?? '',
      'Overall Rating': s.overall_rating ?? '',
      'Status': s.status ?? '',
      'Reply Notes': s.reply_notes ?? '',
      'Replied At': s.replied_at ? new Date(s.replied_at).toLocaleString() : '',
    };
    orderedKeys.forEach(k => {
      const label = fieldMap.get(k) || k;
      const val = s.responses?.[k];
      row[label] = Array.isArray(val) ? val.join(' | ') : (val ?? '');
    });
    return row;
  });

  if (rows.length === 0) {
    downloadCsv(filename, 'No feedback to export');
    return;
  }
  downloadCsv(filename, rowsToCsv(rows));
};
