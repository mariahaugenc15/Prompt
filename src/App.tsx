import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from './lib/store'
import { BottomNav } from './components/BottomNav'
import { LoginFlip } from './pages/LoginFlip'
import { Onboarding } from './pages/Onboarding'
import { Home } from './pages/Home'
import { Feed } from './pages/Feed'
import { Boards } from './pages/Boards'
import { BoardDetail } from './pages/BoardDetail'
import { CreateBoard } from './pages/CreateBoard'
import { Profile } from './pages/Profile'
import { SendPrompt } from './pages/SendPrompt'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-paper">
      <div className="flex-1 pb-4">{children}</div>
      <BottomNav />
    </div>
  )
}

export default function App() {
  const loggedIn = useStore((s) => s.loggedIn)
  const onboarded = useStore((s) => s.onboarded)
  const location = useLocation()

  if (!loggedIn) return <LoginFlip />
  if (!onboarded) return <Onboarding />

  return (
    <Shell key={location.pathname.split('/')[1] || 'home'}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/send" element={<SendPrompt />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/boards" element={<Boards />} />
        <Route path="/boards/new" element={<CreateBoard />} />
        <Route path="/boards/:boardId" element={<BoardDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
