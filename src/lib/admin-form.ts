import { useEffect, useRef } from 'react'
import { ApiError } from './api'

export function validateAdminForm(form: HTMLFormElement): string | null {
  const invalid = [...form.elements].find(element => element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement ? !element.checkValidity() : false) as HTMLInputElement | undefined
  if (!invalid) return null
  invalid.focus()
  invalid.scrollIntoView({ block: 'center' })
  invalid.reportValidity()
  const label = invalid.closest('label')?.querySelector('span')?.textContent || invalid.name
  return `${label}: ${invalid.validationMessage}`
}

export function focusApiError(form: HTMLFormElement, error: unknown) {
  const element = error instanceof ApiError && error.field ? form.elements.namedItem(error.field) : null
  if (element instanceof HTMLElement) {
    element.focus()
    element.scrollIntoView({ block: 'center' })
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      element.setCustomValidity((error as Error).message)
      element.reportValidity()
      element.setCustomValidity('')
    }
  }
}

export function useBusinessDraft(userId: string) {
  const ref = useRef<HTMLFormElement>(null)
  const key = `teachersvip:business-draft:${userId}`
  useEffect(() => {
    try {
      const values = JSON.parse(sessionStorage.getItem(key) || '{}') as Record<string, string>
      for (const element of ref.current?.elements || []) {
        if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && typeof values[element.name] === 'string') element.value = values[element.name]
      }
    } catch { /* Storage may be unavailable; the form still works. */ }
  }, [key])
  const save = () => {
    if (!ref.current) return
    const values = Object.fromEntries(new FormData(ref.current).entries())
    try { sessionStorage.setItem(key, JSON.stringify(values)) } catch { /* Preserve the in-memory form. */ }
  }
  const clear = () => { try { sessionStorage.removeItem(key) } catch { /* Optional draft storage. */ } }
  return { ref, save, clear }
}
