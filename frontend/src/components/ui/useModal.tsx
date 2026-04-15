'use client'
import { useState, useCallback } from 'react'

export function useModal(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen)
  const onOpen = useCallback(() => setOpen(true), [])
  const onClose = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen(v => !v), [])
  return { open, onOpen, onClose, toggle }
}
