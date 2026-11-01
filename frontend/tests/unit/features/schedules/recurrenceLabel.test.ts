import { describe, expect, it } from 'vitest'
import {
  describeDay,
  pendingSince,
  recurrenceLabel,
  shortDate,
  startingOccurrence,
} from '../../../../src/features/schedules/recurrenceLabel'

describe('recurrenceLabel', () => {
  it('fecha única: «Una vez · 5 nov»', () => {
    expect(recurrenceLabel({ kind: 'once', date: '2026-11-05' })).toBe('Una vez · 5 nov')
  })

  it('diaria: «Cada día»', () => {
    expect(recurrenceLabel({ kind: 'daily' })).toBe('Cada día')
  })

  it.each([
    [[1, 3], 'Lunes y miércoles'],
    [[3, 1], 'Lunes y miércoles'],
    [[1, 3, 5], 'Lunes, miércoles y viernes'],
    [[3], 'Miércoles'],
    [[1, 2, 3, 4, 5, 6, 7], 'Todos los días'],
  ] as const)('semanal %j: «%s»', (weekdays, label) => {
    expect(recurrenceLabel({ kind: 'weekly', weekdays: [...weekdays] })).toBe(label)
  })

  it.each([
    [1, 'Día 1 de cada mes'],
    [15, 'Día 15 de cada mes'],
    [28, 'Día 28 de cada mes'],
    [29, 'Día 29 de cada mes (o el último)'],
    [31, 'Día 31 de cada mes (o el último)'],
  ])('mensual día %i: «%s»', (monthDay, label) => {
    expect(recurrenceLabel({ kind: 'monthly', month_day: monthDay })).toBe(label)
  })
})

describe('fechas en español', () => {
  it('shortDate: día y mes abreviado', () => {
    expect(shortDate('2026-11-05')).toBe('5 nov')
    expect(shortDate('2026-01-31')).toBe('31 ene')
  })

  it('describeDay: hoy, mañana o el día de la semana con su fecha', () => {
    expect(describeDay('2026-11-03', '2026-11-03')).toBe('hoy')
    expect(describeDay('2026-11-04', '2026-11-03')).toBe('mañana')
    expect(describeDay('2026-11-09', '2026-11-03')).toBe('lunes 9 nov')
    expect(describeDay('2026-12-31', '2026-11-03')).toBe('jueves 31 dic')
  })

  it('pendingSince: día de la semana abreviado y número', () => {
    expect(pendingSince('2026-11-02')).toBe('lun 2')
    expect(pendingSince('2026-11-06')).toBe('vie 6')
    expect(pendingSince('2026-11-08')).toBe('dom 8')
  })
})

describe('startingOccurrence (vista previa de «Próxima aparición»)', () => {
  const MONDAY_AND_WEDNESDAY = { kind: 'weekly', weekdays: [1, 3] } as const

  it('hoy si hoy toca y aún no se generó nada hoy', () => {
    expect(startingOccurrence(MONDAY_AND_WEDNESDAY, '2026-11-02', null)).toBe('2026-11-02')
  })

  it('la siguiente si hoy ya se generó', () => {
    expect(startingOccurrence(MONDAY_AND_WEDNESDAY, '2026-11-02', '2026-11-02')).toBe('2026-11-04')
  })

  it('el siguiente día que toca, cruzando de semana', () => {
    expect(startingOccurrence(MONDAY_AND_WEDNESDAY, '2026-11-03', null)).toBe('2026-11-04')
    expect(startingOccurrence(MONDAY_AND_WEDNESDAY, '2026-11-05', null)).toBe('2026-11-09')
  })

  it('el día 31 en un mes de 30 días cae el último', () => {
    expect(startingOccurrence({ kind: 'monthly', month_day: 31 }, '2026-11-03', null)).toBe(
      '2026-11-30',
    )
  })

  it('el día 30 y 31 de febrero caen el último día, también en bisiesto', () => {
    expect(startingOccurrence({ kind: 'monthly', month_day: 31 }, '2027-02-01', null)).toBe(
      '2027-02-28',
    )
    expect(startingOccurrence({ kind: 'monthly', month_day: 30 }, '2028-02-01', null)).toBe(
      '2028-02-29',
    )
  })

  it('una fecha única es su fecha si hoy o futura, y nada si ya pasó', () => {
    expect(startingOccurrence({ kind: 'once', date: '2026-11-05' }, '2026-11-03', null)).toBe(
      '2026-11-05',
    )
    expect(startingOccurrence({ kind: 'once', date: '2026-11-03' }, '2026-11-03', null)).toBe(
      '2026-11-03',
    )
    expect(startingOccurrence({ kind: 'once', date: '2026-11-02' }, '2026-11-03', null)).toBeNull()
  })

  it('no depende de los días activos: una diaria cae también en domingo', () => {
    expect(startingOccurrence({ kind: 'daily' }, '2026-11-07', '2026-11-07')).toBe('2026-11-08')
  })
})
