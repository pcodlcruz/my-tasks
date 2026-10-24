import { describe, expect, it } from 'vitest'
import { AVATAR_CATALOG, findAvatar } from '../../../../src/features/profile/avatars'
import {
  AVATAR_COLOR_CLASSES,
  avatarColorClass,
  initialsOf,
} from '../../../../src/features/profile/initials'

// The identifiers of contracts/profile.yaml: ^avatar-(0[1-9]|1[0-2])$
const CONTRACT_IDS = Array.from(
  { length: 12 },
  (_, index) => `avatar-${String(index + 1).padStart(2, '0')}`,
)

describe('catálogo de avatares', () => {
  it('tiene exactamente 12 identificadores avatar-01…12, los del contrato y en orden', () => {
    expect(AVATAR_CATALOG.map((avatar) => avatar.id)).toEqual(CONTRACT_IDS)
  })

  it('cada avatar tiene un nombre accesible no vacío y distinto, y una imagen', () => {
    const names = AVATAR_CATALOG.map((avatar) => avatar.name)

    expect(names.every((name) => name.trim().length > 0)).toBe(true)
    expect(new Set(names).size).toBe(12)
    expect(AVATAR_CATALOG.every((avatar) => avatar.src.length > 0)).toBe(true)
  })

  it('los nombres son los del diseño aprobado', () => {
    expect(AVATAR_CATALOG.map((avatar) => avatar.name)).toEqual([
      'Búho',
      'Zorro',
      'Oso',
      'Gato',
      'Rana',
      'Pingüino',
      'Ballena',
      'Panda',
      'Conejo',
      'Tortuga',
      'Delfín',
      'Mariposa',
    ])
  })

  it('findAvatar devuelve el avatar de un identificador y nada si no es del catálogo', () => {
    expect(findAvatar('avatar-02')?.name).toBe('Zorro')
    expect(findAvatar('avatar-12')?.name).toBe('Mariposa')
    expect(findAvatar('avatar-13')).toBeUndefined()
    expect(findAvatar('')).toBeUndefined()
    expect(findAvatar(null)).toBeUndefined()
  })
})

describe('initialsOf', () => {
  it.each([
    ['Ana', 'A'],
    ['Ana Cruz', 'AC'],
    ['  Ana    Cruz  ', 'AC'],
    ['ana cruz', 'AC'],
    ['Ana María Cruz López', 'AL'],
    ['álvaro núñez', 'ÁN'],
    ['Ana 🌱', 'A'],
    ['🌱 Ana Cruz 🌱', 'AC'],
    ['¡Ana! ¿Cruz?', 'AC'],
    ['(Ana) [Cruz]', 'AC'],
    ['Ana-María Cruz', 'AC'],
    ['3D Studio', '3S'],
  ])('de "%s" saca "%s"', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })

  it('usa el correo cuando no hay nombre o el nombre no tiene letras', () => {
    expect(initialsOf(null, 'ana.cruz@example.com')).toBe('AC')
    expect(initialsOf(undefined, 'ana@example.com')).toBe('A')
    expect(initialsOf('', 'bob_smith-jones@example.com')).toBe('BJ')
    expect(initialsOf('🌱🌱', 'eva@example.com')).toBe('E')
  })

  it('el nombre tiene prioridad sobre el correo', () => {
    expect(initialsOf('Ana Cruz', 'zoe@example.com')).toBe('AC')
  })

  it('nunca devuelve una cadena vacía', () => {
    expect(initialsOf(null)).toBe('?')
    expect(initialsOf('   ', '')).toBe('?')
    expect(initialsOf('🌱', null)).toBe('?')
  })
})

describe('avatarColorClass', () => {
  it('es determinista: el mismo uid da siempre el mismo color', () => {
    expect(avatarColorClass('uid-1')).toBe(avatarColorClass('uid-1'))
    expect(avatarColorClass('')).toBe(avatarColorClass(''))
  })

  it('devuelve siempre un color de la paleta', () => {
    for (const uid of ['a', 'uid-1', 'uid-2', 'ñandú', '🌱', 'x'.repeat(200)]) {
      expect(AVATAR_COLOR_CLASSES).toContain(avatarColorClass(uid))
    }
  })

  it('reparte los uid entre varios colores', () => {
    const colors = new Set(
      Array.from({ length: 60 }, (_, index) => avatarColorClass(`uid-${index}`)),
    )

    expect(colors.size).toBeGreaterThanOrEqual(4)
  })

  it('todos los colores llevan texto blanco sobre un fondo oscuro', () => {
    expect(AVATAR_COLOR_CLASSES.length).toBeGreaterThanOrEqual(6)
    for (const colorClass of AVATAR_COLOR_CLASSES) {
      expect(colorClass).toMatch(/\bbg-[a-z]+-(600|700|800|900)\b/)
      expect(colorClass).toContain('text-white')
    }
  })
})
