export function normalizeColumnLabel(label: string | undefined): string {
  if (!label) return 'Column';
  return /^column\s+\d{10,}$/i.test(label.trim()) ? 'Column' : label;
}

export function normalizeRowLabel(label: string | undefined): string {
  if (!label) return 'Row';
  return /^row\s+\d{10,}$/i.test(label.trim()) ? 'Row' : label;
}
