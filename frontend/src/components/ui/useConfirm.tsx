'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmOptions { title: string; description?: string; tone?: 'danger' | 'primary'; confirmLabel?: string }
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false))

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)
  const confirm: ConfirmFn = useCallback((opts) => new Promise((resolve) => setState({ opts, resolve })), [])
  const handleClose = (val: boolean) => { state?.resolve(val); setState(null) }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal open onClose={() => handleClose(false)} title={state.opts.title}
          footer={<>
            <Button variant="secondary" size="sm" onClick={() => handleClose(false)}>취소</Button>
            <Button variant={state.opts.tone === 'danger' ? 'danger' : 'primary'} size="sm" onClick={() => handleClose(true)}>
              {state.opts.confirmLabel ?? '확인'}
            </Button>
          </>}
        >
          {state.opts.description && <p className="text-sm text-slate-600">{state.opts.description}</p>}
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}
export const useConfirm = () => useContext(ConfirmContext)
