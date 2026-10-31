import type { ArcadeScore, Notice, Progress } from '../../api/types'
import { formatScore } from './arcadeCatalog'
import { EnergyBar } from './EnergyBar'

interface DayScoreboardProps {
  progress: Progress | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onOpenReview: () => void
  // Closes a notice of a schedule that did not fit (it is confirmed, so it does not come back).
  onDismissNotice: (noticeId: string) => void
}

function completedText(completed: number, goal: number): string {
  return `${completed} de ${goal} ${goal === 1 ? 'tarea completada' : 'tareas completadas'} hoy`
}

// The day's scoreboard above the quadrants (S3 v3): "HOY 2/3", the energy bar and the streak.
// The pixel figure is hidden from assistive technology and repeated in plain words; with the
// arcade mode off it becomes "Hoy 2 de 3" in the normal font. A failure to load it is a discreet
// notice, never an alert: the board works without it (FR-034). With the arcade mode on it also
// shows the score and the level; meeting the goal is only marked here, the celebrations (S3-c)
// announce it.
export function DayScoreboard({
  progress,
  isLoading,
  isError,
  onRetry,
  onOpenReview,
  onDismissNotice,
}: DayScoreboardProps): JSX.Element {
  return (
    <section
      aria-label="Marcador del día"
      className="mb-6 rounded-xl border border-border bg-surface p-4 shadow-card"
    >
      {progress === undefined && isLoading && (
        <div
          role="status"
          aria-label="Cargando progreso"
          className="h-12 animate-pulse rounded-lg bg-surface-alt"
        />
      )}

      {progress !== undefined && <Scoreboard progress={progress} onOpenReview={onOpenReview} />}

      {progress !== undefined && progress.notices.length > 0 && (
        <ul
          role="status"
          aria-label="Avisos de programaciones"
          className="mt-3 flex flex-col gap-2 border-t border-border pt-3"
        >
          {progress.notices.map((notice) => (
            <li
              key={notice.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-caption text-text"
            >
              <span>{noticeText(notice)}</span>
              <button
                type="button"
                onClick={() => onDismissNotice(notice.id)}
                className="rounded-md border border-border bg-surface px-3 py-1 font-semibold text-text hover:bg-surface-alt"
              >
                Entendido
              </button>
            </li>
          ))}
        </ul>
      )}

      {isError && (
        <p className="mt-2 text-caption text-text-muted first:mt-0">
          {progress === undefined
            ? 'No se pudo cargar tu progreso.'
            : 'No se pudo actualizar tu progreso.'}{' '}
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold text-primary underline hover:text-primary-hover"
          >
            Reintentar
          </button>
        </p>
      )}
    </section>
  )
}

// The 500-active-task limit is what stops a schedule from creating its task (research R7).
function noticeText(notice: Notice): string {
  const subject =
    notice.schedule_title !== null
      ? `La tarea programada «${notice.schedule_title}»`
      : 'Una tarea programada'
  return `${subject} no cupo: tienes 500 tareas activas.`
}

interface ScoreboardProps {
  progress: Progress
  onOpenReview: () => void
}

function Scoreboard({ progress, onOpenReview }: ScoreboardProps): JSX.Element {
  const { completed_count: completed, goal, goal_met: goalMet, streak, mission } = progress
  const overGoal = completed > goal

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex flex-col">
        {progress.arcade !== null ? (
          <span aria-hidden="true" className="font-pixel text-sm leading-6 text-text">
            HOY{' '}
            <span className={overGoal ? 'text-energy-extra' : 'text-energy-fill'}>{completed}</span>
            /{goal}
          </span>
        ) : (
          <span aria-hidden="true" className="text-body-strong text-text">
            Hoy {completed} de {goal}
          </span>
        )}
        <span className="text-caption text-text-muted">{completedText(completed, goal)}</span>
      </div>

      <EnergyBar completed={completed} goal={goal} />

      {goalMet && (
        <p className="text-caption font-semibold text-success">
          <span aria-hidden="true">✓ </span>Meta cumplida
        </p>
      )}

      {streak > 0 && (
        <p className="flex items-center gap-2 text-caption font-semibold text-streak">
          <FlameIcon />
          Racha {streak} {streak === 1 ? 'día' : 'días'}
          {progress.streak_at_stake && (
            <span className="rounded border border-streak/40 px-1.5 py-0.5 font-normal">
              en juego
            </span>
          )}
        </p>
      )}

      {mission.task_ids.length > 0 && (
        <p className="flex items-center gap-1.5 text-caption font-semibold text-text">
          <span aria-hidden="true" className="text-gold">
            ★
          </span>
          Misión {mission.completed_ids.length}/{mission.task_ids.length}
          {mission.cleared && ' cumplida'}
        </p>
      )}

      {!progress.is_active_day && (
        <p className="text-caption text-text-muted">Hoy no es día activo: la racha no cambia.</p>
      )}

      {progress.arcade !== null && <ArcadeScoreboard arcade={progress.arcade} />}

      <button
        type="button"
        onClick={onOpenReview}
        className="ml-auto flex items-center gap-2 rounded-md border-2 border-text-muted bg-surface px-3 py-2 text-text hover:border-primary hover:text-primary"
      >
        <span className="font-pixel text-xs leading-5">PULSA START</span>
        <span className="sr-only">: abrir el inicio de jornada</span>
      </button>
    </div>
  )
}

// Score and level (arcade mode): the pixel figure is decorative, its words go next to it.
function ArcadeScoreboard({ arcade }: { arcade: ArcadeScore }): JSX.Element {
  const score = formatScore(arcade.score)
  return (
    <div className="flex flex-col">
      <p className="flex items-center gap-1.5 text-caption font-semibold text-gold">
        <span aria-hidden="true">★</span>
        NIVEL {arcade.level} · {arcade.level_name}
      </p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span aria-hidden="true" className="font-pixel text-sm leading-6 text-gold">
          {score} PTS
        </span>
        <span className="sr-only">{score} puntos</span>
        <span className="text-caption text-text-muted">
          +{formatScore(arcade.points_today)} hoy
        </span>
      </p>
      <p className="text-caption text-text-muted">
        {arcade.next_level_at === null
          ? 'Nivel máximo'
          : `Faltan ${formatScore(arcade.next_level_at - arcade.score)} para el nivel ${arcade.level + 1}`}
      </p>
    </div>
  )
}

function FlameIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"
        clipRule="evenodd"
      />
    </svg>
  )
}
