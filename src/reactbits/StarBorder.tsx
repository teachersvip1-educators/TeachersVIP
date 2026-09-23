// Adapted from React Bits StarBorder (reactbits.dev/animations/star-border).
import { type ReactNode } from "react"
import { Link } from "react-router-dom"

export default function StarBorder({
  children,
  to,
  className = "",
}: {
  children: ReactNode
  to: string
  className?: string
}) {
  return (
    <Link className={`rb-star-border ${className}`} to={to}>
      <span className="rb-star-top" aria-hidden="true" />
      <span className="rb-star-bottom" aria-hidden="true" />
      <span className="rb-star-content">{children}</span>
    </Link>
  )
}
