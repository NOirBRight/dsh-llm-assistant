/** Compact markdown renderer using the same design tokens as main-chat MarkdownText. */

import { cls } from './css.ts'

export function MiniMarkdown({ text, streaming = false }: { text: string; streaming?: boolean }): JSX.Element {
  const html = renderMarkdown(text) + (streaming ? '<span class="dsh-assistant-caret">▍</span>' : '')
  return <div className={cls.md} dangerouslySetInnerHTML={{ __html: html }} />
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(value: string): string {
  let out = escapeHtml(value)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  out = out.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  return out
}

function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.startsWith('```')) {
      const lang = escapeHtml(line.slice(3).trim())
      const body: string[] = []
      i += 1
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        body.push(lines[i] ?? '')
        i += 1
      }
      i += 1
      html.push('<pre><code data-lang="' + lang + '">' + escapeHtml(body.join('\n')) + '</code></pre>')
      continue
    }
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-+/.test(lines[i + 1] ?? '')) {
      const header = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\|/.test(lines[i] ?? '')) {
        rows.push(splitRow(lines[i] ?? ''))
        i += 1
      }
      html.push('<div class="dsh-assistant-table"><table><thead><tr>' + header.map((cell) => '<th>' + inline(cell) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((cell) => '<td>' + inline(cell) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>')
      continue
    }
    if (/^#{1,3}\s/.test(line)) {
      const level = line.replace(/[^#].*$/, '').length
      html.push('<h' + String(level) + '>' + inline(line.replace(/^#+\s/, '')) + '</h' + String(level) + '>')
      i += 1
      continue
    }
    if (/^>\s?/.test(line)) {
      html.push('<blockquote><p>' + inline(line.replace(/^>\s?/, '')) + '</p></blockquote>')
      i += 1
      continue
    }
    if (/^[-*]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i] ?? '')) {
        items.push('<li>' + inline((lines[i] ?? '').replace(/^[-*]\s/, '')) + '</li>')
        i += 1
      }
      html.push('<ul>' + items.join('') + '</ul>')
      continue
    }
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i] ?? '')) {
        items.push('<li>' + inline((lines[i] ?? '').replace(/^\d+\.\s/, '')) + '</li>')
        i += 1
      }
      html.push('<ol>' + items.join('') + '</ol>')
      continue
    }
    if (line.trim() === '') {
      i += 1
      continue
    }
    const para: string[] = [line]
    i += 1
    while (i < lines.length && (lines[i] ?? '').trim() !== '' && !/^(```|#|\||>|[-*]|\d+\.)/.test(lines[i] ?? '')) {
      para.push(lines[i] ?? '')
      i += 1
    }
    html.push('<p>' + para.map(inline).join('<br/>') + '</p>')
  }
  return html.join('')
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}
