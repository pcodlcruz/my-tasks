import type { Scope } from '../../api/types'

export interface TaskFormValues {
  title: string
  description: string
  urgent: boolean
  important: boolean
  scope: Scope | null
}

export interface TaskFormErrors {
  title?: string
  description?: string
  scope?: string
}

export const TITLE_MAX_LENGTH = 200
export const DESCRIPTION_MAX_LENGTH = 2000

export function validateTaskForm(values: TaskFormValues): TaskFormErrors {
  const errors: TaskFormErrors = {}
  const title = values.title.trim()
  const description = values.description.trim()

  if (title.length === 0) {
    errors.title = 'El título no puede estar vacío.'
  } else if (title.length > TITLE_MAX_LENGTH) {
    errors.title = `El título no puede superar los ${TITLE_MAX_LENGTH} caracteres.`
  }

  if (description.length === 0) {
    errors.description = 'La descripción no puede estar vacía.'
  } else if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `La descripción no puede superar los ${DESCRIPTION_MAX_LENGTH} caracteres.`
  }

  if (values.scope === null) {
    errors.scope = 'Elige un ámbito.'
  }

  return errors
}

export function isTaskFormValid(errors: TaskFormErrors): boolean {
  return Object.keys(errors).length === 0
}
