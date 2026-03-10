import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import Auth from './pages/Auth'
import Sidebar from './components/ui/Sidebar'
import HomePage from './pages/HomePage'
import GymPage from './pages/GymPage'
import GuitarPage from './pages/GuitarPage'
import StudyPage from './pages/StudyPage'
import ProjectsPage from './pages/ProjectsPage'
import { supabase } from './lib/supabase'

export const MODULES = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'gym', label: 'Gym', icon: '◈' },
  { id: 'guitar', label: 'Guitar', icon: '♪' },
  { id: 'study', label: 'Study', icon: '◎' },
  { id: 'projects', label: 'Projects', icon: '▤' },
]

export default function App() {
  const { user, loading } = useAuth()
  const [activeModule, setActiveModule] = useState('home')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
      <p className="text-sm text-[#999]">Loading...</p>
    </div>
  )

  if (!user) return <Auth />

  function renderModule() {
    switch (activeModule) {
      case 'home': return <HomePage />
      case 'gym': return <GymPage />
      case 'guitar': return <GuitarPage />
      case 'study': return <StudyPage />
      case 'projects': return <ProjectsPage />
      default: return <HomePage />
    }
  }

  const currentModule = MODULES.find(m => m.id === activeModule)

  return (
    <div className="min-h-screen bg-[#fafafa] flex">
      {/* Sidebar — desktop always visible, mobile as drawer */}
      <Sidebar
        modules={MODULES}
        activeModule={activeModule}
        setActiveModule={(id) => { setActiveModule(id); setSidebarOpen(false) }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        onSignOut={() => supabase.auth.signOut()}
      />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-56">
        {/* Top bar — mobile only */}
        <header className="lg:hidden flex items-center justify-between px-4 h-12 border-b border-[#ebebeb] bg-white sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-lg w-8 h-8 flex items-center justify-center text-[#111]"
          >
            {currentModule?.icon}
          </button>
          <span className="text-sm font-semibold text-[#111]">Lock In</span>
          <div className="w-8" />
        </header>

        <main className="flex-1">
          {renderModule()}
        </main>
      </div>
    </div>
  )
}