import { Fragment } from 'react'
import { Link } from 'react-router-dom'

// Tiny, safe Markdown renderer for assistant replies: paragraphs, "- " lists,
// **bold** and [text](/internal/path) links. Everything is rendered as React
// elements (never raw HTML), and only links to our own pages are clickable.

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g

function renderInline(text, keyPrefix) {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) return <strong key={key}>{bold[1]}</strong>
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) {
      const [, label, href] = link
      const internal = href.startsWith('/') && !href.startsWith('//')
      return internal ? (
        <Link key={key} to={href} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-700">
          {label}
        </Link>
      ) : (
        <Fragment key={key}>{label}</Fragment>
      )
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

export default function ChatMessageText({ text }) {
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <div className="space-y-2">
      {blocks.map((block, b) => {
        const lines = block.split('\n')
        const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))
        if (isList) {
          return (
            <ul key={b} className="list-disc space-y-1 pl-5">
              {lines.map((l, i) => (
                <li key={i}>{renderInline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''), `${b}-${i}`)}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={b}>
            {lines.map((l, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {renderInline(l, `${b}-${i}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
