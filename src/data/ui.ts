import { create } from 'zustand'

export type SheetState =
  | { type: 'log' }
  | { type: 'logMatch'; activityId?: string; matchId?: string }
  | { type: 'logBody' }
  | { type: 'exercise'; exerciseId?: string; name?: string; onSaved?: (id: string) => void }
  | { type: 'pickExercise'; onPick: (id: string) => void }
  | { type: 'finishWorkout' }

export interface Rest {
  /** epoch ms when the rest ends */
  until: number
  total: number
  label: string
}

interface Ui {
  sheet: SheetState | null
  reveal: string | null
  workoutOpen: boolean
  rest: Rest | null
  toast: { id: number; text: string } | null
  open: (s: SheetState) => void
  close: () => void
  showReveal: (matchId: string | null) => void
  setWorkoutOpen: (v: boolean) => void
  startRest: (secs: number, label: string) => void
  nudgeRest: (secs: number) => void
  stopRest: () => void
  say: (text: string) => void
}

export const useUi = create<Ui>()((set) => ({
  sheet: null,
  reveal: null,
  workoutOpen: false,
  rest: null,
  toast: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
  showReveal: (reveal) => set({ reveal }),
  setWorkoutOpen: (workoutOpen) => set({ workoutOpen }),
  startRest: (secs, label) => set({ rest: { until: Date.now() + secs * 1000, total: secs, label } }),
  nudgeRest: (secs) =>
    set((s) => {
      if (!s.rest) return {}
      const until = Math.max(Date.now(), s.rest.until + secs * 1000)
      return { rest: { ...s.rest, until, total: Math.max(s.rest.total + secs, 1) } }
    }),
  stopRest: () => set({ rest: null }),
  say: (text) => {
    const id = Date.now()
    set({ toast: { id, text } })
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : {})), 2600)
  },
}))
