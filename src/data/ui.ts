import { create } from 'zustand'
import { useStore } from './store'

export type SheetState =
  | { type: 'log' }
  | { type: 'logMatch'; activityId?: string; matchId?: string }
  | { type: 'logBody' }
  | { type: 'exercise'; exerciseId?: string; name?: string; onSaved?: (id: string) => void }
  // `many` keeps the sheet open while you build a workout, so several can go in at one sitting
  | { type: 'pickExercise'; onPick: (id: string) => void; many?: boolean }
  // workouts to put in a programme: the ones not in it yet, or a new one
  | { type: 'pickRoutine'; onPick: (id: string) => void; exclude: string[] }
  // the goals for the run of a programme you're on
  | { type: 'goals'; programmeId: string }
  | { type: 'finishWorkout' }

interface Ui {
  sheet: SheetState | null
  reveal: string | null
  workoutOpen: boolean
  toast: { id: number; text: string } | null
  open: (s: SheetState) => void
  close: () => void
  showReveal: (matchId: string | null) => void
  setWorkoutOpen: (v: boolean) => void
  say: (text: string) => void
}

export const useUi = create<Ui>()((set) => ({
  sheet: null,
  reveal: null,
  workoutOpen: false,
  toast: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
  showReveal: (reveal) => set({ reveal }),
  setWorkoutOpen: (workoutOpen) => set({ workoutOpen }),
  say: (text) => {
    const id = Date.now()
    set({ toast: { id, text } })
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : {})), 2600)
  },
}))

/** Stop asking to rate a game, and say where it still lives. */
export function useSkipRating() {
  const skip = useStore((s) => s.skipRating)
  const say = useUi((s) => s.say)
  return (activityId: string) => {
    skip(activityId)
    say('Skipped. It’s still in All activity')
  }
}
