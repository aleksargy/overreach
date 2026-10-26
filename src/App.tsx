import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect } from 'react'
import { createBrowserRouter, createMemoryRouter, Navigate, RouterProvider, ScrollRestoration, useLocation, useOutlet, type RouteObject } from 'react-router'
import { TabBar } from './components/TabBar'
import { APP_NAME } from './config'
import { refresh } from './data/api'
import { useStore } from './data/store'
import { useUi } from './data/ui'
import { BodyScreen } from './screens/body/BodyScreen'
import { LogBodySheet } from './screens/body/LogBodySheet'
import { ActivityScreen } from './screens/feed/ActivityScreen'
import { FeedScreen } from './screens/feed/FeedScreen'
import { FootballScreen } from './screens/football/FootballScreen'
import { LogMatchSheet } from './screens/football/LogMatchSheet'
import { MatchReportScreen } from './screens/football/MatchReportScreen'
import { RatingReveal } from './screens/football/RatingReveal'
import { RunScreen } from './screens/run/RunScreen'
import { GhostScreen } from './screens/run/GhostScreen'
import { RaceReportScreen } from './screens/run/RaceReportScreen'
import { ExerciseScreen } from './screens/lift/ExerciseScreen'
import { ExerciseSheet, PickExerciseSheet } from './screens/lift/ExerciseSheets'
import { LiftScreen } from './screens/lift/LiftScreen'
import { MiniWorkoutBar, WorkoutOverlay } from './screens/lift/WorkoutOverlay'
import { WorkoutScreen } from './screens/lift/WorkoutScreen'
import { SettingsScreen } from './screens/settings/SettingsScreen'
import { LogSheet } from './screens/today/LogSheet'
import { TodayScreen } from './screens/today/TodayScreen'

const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      { path: '/', element: <TodayScreen /> },
      { path: '/run', element: <RunScreen /> },
      { path: '/race/:id', element: <RaceReportScreen /> },
      { path: '/ghost/:id', element: <GhostScreen /> },
      { path: '/feed', element: <FeedScreen /> },
      { path: '/activity/:id', element: <ActivityScreen /> },
      { path: '/football', element: <FootballScreen /> },
      { path: '/match/:id', element: <MatchReportScreen /> },
      { path: '/lift', element: <LiftScreen /> },
      { path: '/lift/exercise/:id', element: <ExerciseScreen /> },
      { path: '/lift/history/:id', element: <WorkoutScreen /> },
      { path: '/body', element: <BodyScreen /> },
      { path: '/settings', element: <SettingsScreen /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]

// The preview build lives in a sandboxed frame with no real URL to route on,
// so it keeps history in memory. Only a bare #token survives the frame, so
// #run, #football, #body, #feed, #lift or #prefs picks the first screen.
const PREVIEW_START: Record<string, string> = { run: '/run', feed: '/feed', football: '/football', lift: '/lift', body: '/body', prefs: '/settings' }
const router = import.meta.env.VITE_PREVIEW === '1' ? createMemoryRouter(routes, { initialEntries: [PREVIEW_START[location.hash.slice(1)] ?? '/'] }) : createBrowserRouter(routes)

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  )
}

function Shell() {
  const hydrated = useStore((s) => s.hydrated)
  const loc = useLocation()
  const outlet = useOutlet()
  const active = useStore((s) => !!s.active)
  const workoutOpen = useUi((s) => s.workoutOpen)
  const mini = active && !workoutOpen

  // Screens pad their bottom by this so the minimised workout bar never covers content.
  useEffect(() => {
    document.documentElement.style.setProperty('--mini-h', mini ? '60px' : '0px')
  }, [mini])

  // Pick up new Garmin data when the app opens or comes back to the foreground.
  useEffect(() => {
    if (!hydrated) return
    let last = 0
    const go = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 10 * 60_000) return
      last = Date.now()
      void refresh()
    }
    go()
    document.addEventListener('visibilitychange', go)
    return () => document.removeEventListener('visibilitychange', go)
  }, [hydrated])

  if (!hydrated) return <Splash />
  return (
    <>
      <motion.main key={loc.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}>
        {outlet}
      </motion.main>
      <MiniWorkoutBar />
      <TabBar />
      <LogSheet />
      <LogMatchSheet />
      <LogBodySheet />
      <ExerciseSheet />
      <PickExerciseSheet />
      <WorkoutOverlay />
      <RatingReveal />
      <Toast />
      <ScrollRestoration />
    </>
  )
}

function Splash() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-ink-0">
      <div className="flex flex-col items-center gap-5">
        <span className="text-[26px] font-semibold leading-none tracking-[-0.035em]">{APP_NAME}</span>
        <span className="relative h-[2px] w-20 overflow-hidden rounded-full bg-ink-3">
          <span className="absolute inset-y-0 left-0 w-1/2 animate-[load_1s_ease-in-out_infinite] rounded-full bg-fg-2" />
        </span>
      </div>
    </div>
  )
}

function Toast() {
  const toast = useUi((s) => s.toast)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+10px)] z-[70] flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            className="rounded-full bg-ink-2/95 px-4 py-2.5 text-[14px] font-medium shadow-[0_12px_40px_rgb(0_0_0/0.5),inset_0_0_0_1px_rgb(var(--fg)/0.06)] backdrop-blur-xl"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
