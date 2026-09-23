// Adapted from React Bits SpotlightCard (reactbits.dev/components/spotlight-card).
import { useRef, type ReactNode } from "react"

export default function SpotlightCard({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  const card = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={card}
      className={`rb-spotlight ${className}`}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || !card.current) return
        const bounds = card.current.getBoundingClientRect()
        card.current.style.setProperty(
          "--rb-x",
          `${event.clientX - bounds.left}px`,
        )
        card.current.style.setProperty(
          "--rb-y",
          `${event.clientY - bounds.top}px`,
        )
      }}
    >
      {children}
    </div>
  )
}
