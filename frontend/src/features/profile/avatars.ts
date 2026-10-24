import avatar01 from '../../assets/avatars/avatar-01.svg'
import avatar02 from '../../assets/avatars/avatar-02.svg'
import avatar03 from '../../assets/avatars/avatar-03.svg'
import avatar04 from '../../assets/avatars/avatar-04.svg'
import avatar05 from '../../assets/avatars/avatar-05.svg'
import avatar06 from '../../assets/avatars/avatar-06.svg'
import avatar07 from '../../assets/avatars/avatar-07.svg'
import avatar08 from '../../assets/avatars/avatar-08.svg'
import avatar09 from '../../assets/avatars/avatar-09.svg'
import avatar10 from '../../assets/avatars/avatar-10.svg'
import avatar11 from '../../assets/avatars/avatar-11.svg'
import avatar12 from '../../assets/avatars/avatar-12.svg'

export interface CatalogAvatar {
  // Stable identifier stored in the profile and accepted by the API (`avatar-01` … `avatar-12`):
  // it never changes even if an illustration is redrawn.
  id: string
  // Spanish name of the approved design, used as the accessible text of the image.
  name: string
  src: string
}

export const AVATAR_CATALOG: readonly CatalogAvatar[] = [
  { id: 'avatar-01', name: 'Búho', src: avatar01 },
  { id: 'avatar-02', name: 'Zorro', src: avatar02 },
  { id: 'avatar-03', name: 'Oso', src: avatar03 },
  { id: 'avatar-04', name: 'Gato', src: avatar04 },
  { id: 'avatar-05', name: 'Rana', src: avatar05 },
  { id: 'avatar-06', name: 'Pingüino', src: avatar06 },
  { id: 'avatar-07', name: 'Ballena', src: avatar07 },
  { id: 'avatar-08', name: 'Panda', src: avatar08 },
  { id: 'avatar-09', name: 'Conejo', src: avatar09 },
  { id: 'avatar-10', name: 'Tortuga', src: avatar10 },
  { id: 'avatar-11', name: 'Delfín', src: avatar11 },
  { id: 'avatar-12', name: 'Mariposa', src: avatar12 },
]

export function findAvatar(id: string | null | undefined): CatalogAvatar | undefined {
  return AVATAR_CATALOG.find((avatar) => avatar.id === id)
}
