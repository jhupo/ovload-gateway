export function downloadCsv(name: string, rows: unknown[][]) {
  const cell = (value: unknown) => {
    let text = value == null ? '' : String(value)
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }
  const blob = new Blob(
    ['\uFEFF', rows.map((row) => row.map(cell).join(',')).join('\r\n')],
    { type: 'text/csv;charset=utf-8' }
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
