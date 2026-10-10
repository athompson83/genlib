/** CSV export with formula injection protection and explicit column selection. */
export interface CsvColumn<T> { header: string; value: (row: T) => string | number | boolean | null | undefined }
const cell = (value: unknown): string => {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
};
export function exportCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[], maxRows = 10000): string {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || rows.length > maxRows || !columns.length || columns.length > 100) throw new Error("Invalid export bounds");
  return [columns.map(c => cell(c.header)).join(","), ...rows.map(r => columns.map(c => cell(c.value(r))).join(","))].join("\r\n") + "\r\n";
}
