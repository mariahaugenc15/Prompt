import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from './lib/store'
import { BottomNav } from './components/BottomNav'
import { AppHeader } from './components/AppHeader'
import { RealShell } from './components/RealShell'
import { LoginFlip } from './pages/LoginFlip'
import { Onboarding } from './pages/Onboarding'
import { Home } from './pages/Home'
import { Feed } from './pages/Feed'
import { Boards } from './pages/Boards'
import { BoardDetail } from './pages/BoardDetail'
import { CreateBoard } from './pages/CreateBoard'
import { Profile } from './pages/Profile'
import { SendPrompt } from './pages/SendPrompt'
import { SignUp } from './pages/SignUp'
import { Login } from './pages/Login'
import { OrgPage } from './pages/OrgPage'
import { RealInbox } from './pages/RealInbox'
import { RealSend } from './pages/RealSend'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen min-h-dvh w-full max-w-xl flex-col bg-paper">
      <AppHeader />
      <div className="flex-1 pb-4">{children}</div>
      <BottomNav />
    </div>
  )
}

function Protected({ children }: { children: ReactNode }) {
  const loggedIn = useStore((s) => s.loggedIn)
  const onboarded = useStore((s) => s.onboarded)
  const location = useLocation()

  if (!loggedIn) return <LoginFlip />
  if (!onboarded) return <Onboarding />
  return <Shell key={location.pathname.split('/')[1] || 'home'}>{children}</Shell>
}

export default function App() {
  return (
    <Routes>
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/o/:username"
        element={
          <RealShell>
            <OrgPage />
          </RealShell>
        }
      />
      <Route
        path="/real/inbox"
        element={
          <RealShell>
            <RealInbox />
          </RealShell>
        }
      />
      <Route
        path="/real/send"
        element={
          <RealShell>
            <RealSend />
          </RealShell>
        }
      />
      <Route
        path="/"
        element={
          <Protected>
            <Home />
          </Protected>
        }
      />
      <Route
        path="/send"
        element={
          <Protected>
            <SendPrompt />
          </Protected>
        }
      />
      <Route
        path="/feed"
        element={
          <Protected>
            <Feed />
          </Protected>
        }
      />
      <Route
        path="/boards"
        element={
          <Protected>
            <Boards />
          </Protected>
        }
      />
      <Route
        path="/boards/new"
        element={
          <Protected>
            <CreateBoard />
          </Protected>
        }
      />
      <Route
        path="/boards/:boardId"
        element={
          <Protected>
            <BoardDetail />
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected>
            <Profile />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
