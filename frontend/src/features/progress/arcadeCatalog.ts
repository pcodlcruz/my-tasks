// Names of the levels and achievements, to word the announcements: the server sends a level
// number or an achievement id. Kept in step with LEVELS and ACHIEVEMENTS in
// backend/src/mytasks_api/domain/progress.py; an unknown one gets a generic wording.
export const LEVEL_NAMES: Readonly<Record<number, string>> = {
  1: 'Novato',
  2: 'Aprendiz',
  3: 'Jugador',
  4: 'Veterano',
  5: 'Experto',
  6: 'Maestro',
  7: 'Campeón',
  8: 'Leyenda',
  9: 'Mito',
  10: 'Jefe final',
}

export const ACHIEVEMENT_NAMES: Readonly<Record<string, string>> = {
  first_coin: 'Primera moneda',
  stage_clear: 'Fase superada',
  mission_clear: 'Misión cumplida',
  streak_3: 'Racha de 3',
  streak_7: 'Racha de 7',
  streak_30: 'Racha de 30',
  tasks_10: '10 tareas',
  tasks_100: '100 tareas',
  tasks_500: '500 tareas',
  do_now_clear: 'Sin urgencias',
  scheduled_done: 'Puntual',
  new_record: 'Nuevo récord',
}

const SCORE_FORMAT = new Intl.NumberFormat('es-ES', { useGrouping: 'always' })

// "3.450": Spanish leaves four-digit numbers ungrouped by default, the arcade look groups them.
export function formatScore(points: number): string {
  return SCORE_FORMAT.format(points)
}
