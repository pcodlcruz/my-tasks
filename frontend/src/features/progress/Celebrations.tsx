import { useEffect, useRef, useState } from 'react'
import { useAcknowledge, useProgress } from '../../api/progress'
import type { Announcement, Progress } from '../../api/types'
import { usePrefersReducedMotion } from '../../lib/motion'
import { ACHIEVEMENT_NAMES, LEVEL_NAMES, formatScore } from './arcadeCatalog'

// How long each celebration stays before the next one (docs/design/DESIGN.md § Celebraciones).
const DISPLAY_MS = 3000

function withId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return new Set(ids).add(id)
}

interface CelebrationText {
  title: string
  detail: string
}

function celebrationText(announcement: Announcement, progress: Progress): CelebrationText {
  const { value } = announcement
  switch (announcement.kind) {
    case 'phase_clear':
      return {
        title: `¡FASE SUPERADA! +${formatScore(Number(value ?? 0))}`,
        detail: 'Has cumplido la meta del día.',
      }
    case 'mission_clear':
      return {
        title: `¡MISIÓN CUMPLIDA! +${formatScore(Number(value ?? 0))}`,
        detail: 'Has completado todas las tareas de la misión.',
      }
    case 'level_up': {
      const level = Number(value)
      const name =
        progress.arcade?.level === level ? progress.arcade.level_name : LEVEL_NAMES[level]
      return {
        title: '¡SUBES DE NIVEL!',
        detail: name ? `Nivel ${level} · ${name}` : `Nivel ${level}`,
      }
    }
    case 'achievement':
      return {
        title: 'LOGRO DESBLOQUEADO',
        detail: `Logro: ${ACHIEVEMENT_NAMES[String(value)] ?? 'nuevo logro'}`,
      }
    case 'new_record':
      return {
        title: '¡NUEVO RÉCORD!',
        detail: `${Number(value)} tareas en un día`,
      }
  }
}

// The arcade celebrations (S3-c): the server's pending announcements, one at a time, in a
// non-modal notice that never takes the focus and closes by itself after a few seconds or with
// «Cerrar». Each is confirmed when it is shown, so no other device shows it again. With reduced
// motion it appears and goes without moving; with the arcade mode off there is none (the server
// keeps them for when it comes back).
export function Celebrations(): JSX.Element {
  const { data: progress } = useProgress()
  const { mutate: acknowledge } = useAcknowledge()
  const reducedMotion = usePrefersReducedMotion()
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set())
  const confirmed = useRef(new Set<string>())

  const current =
    progress?.arcade === null || progress === undefined
      ? undefined
      : progress.announcements.find((announcement) => !closed.has(announcement.id))
  const currentId = current?.id

  useEffect(() => {
    if (currentId === undefined) return
    if (!confirmed.current.has(currentId)) {
      confirmed.current.add(currentId)
      acknowledge({ announcement_ids: [currentId] })
    }
    const timer = setTimeout(() => setClosed((previous) => withId(previous, currentId)), DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [currentId, acknowledge])

  function close(id: string): void {
    setClosed((previous) => withId(previous, id))
  }

  const text =
    current !== undefined && progress !== undefined ? celebrationText(current, progress) : null

  return (
    <div
      data-celebrations
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 top-24 z-[55] flex justify-center px-4"
    >
      {current !== undefined && text !== null && (
        <div
          key={current.id}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border-2 border-gold bg-surface p-4 shadow-modal ${
            reducedMotion ? '' : 'animate-pop'
          }`}
        >
          <span aria-hidden="true" className="text-xl leading-none text-gold">
            ★
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-pixel text-xs leading-5 text-gold">{text.title}</p>
            <p className="mt-1 text-caption text-text">{text.detail}</p>
          </div>
          <button
            type="button"
            onClick={() => close(current.id)}
            className="rounded px-1.5 py-0.5 text-caption text-text-muted hover:bg-surface-alt hover:text-text"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
