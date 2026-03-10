import { useState } from 'react'
import SubTabs from '../components/ui/SubTabs'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'plan', label: 'Plan' },
  { id: 'friends', label: 'Friends' },
  { id: 'goals', label: 'Goals' },
]

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div>
      <SubTabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="p-6">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'plan' && <Plan />}
        {activeTab === 'friends' && <Friends />}
        {activeTab === 'goals' && <Goals />}
      </div>
    </div>
  )
}

function Dashboard() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xs font-medium text-[#999] uppercase tracking-wider mb-3">Today</h2>
        <div className="bg-white border border-[#ebebeb] p-4">
          <p className="text-sm text-[#999]">No sessions scheduled for today.</p>
        </div>
      </div>
      <div>
        <h2 className="text-xs font-medium text-[#999] uppercase tracking-wider mb-3">Streaks</h2>
        <div className="grid grid-cols-3 gap-3">
          {['Gym', 'Guitar', 'Study'].map(m => (
            <div key={m} className="bg-white border border-[#ebebeb] p-4 text-center">
              <p className="text-2xl font-semibold text-[#111]">0</p>
              <p className="text-xs text-[#999] mt-1">{m}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="text-xs font-medium text-[#999] uppercase tracking-wider mb-3">Up next</h2>
        <div className="bg-white border border-[#ebebeb] p-4">
          <p className="text-sm text-[#999]">No upcoming tasks.</p>
        </div>
      </div>
    </div>
  )
}

function Plan() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xs font-medium text-[#999] uppercase tracking-wider mb-3">Plan & To Do</h2>
      <div className="bg-white border border-[#ebebeb] p-4">
        <p className="text-sm text-[#999]">Your schedule and tasks will appear here.</p>
      </div>
    </div>
  )
}

function Friends() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xs font-medium text-[#999] uppercase tracking-wider mb-3">Friends</h2>
      <div className="bg-white border border-[#ebebeb] p-4">
        <p className="text-sm text-[#999]">Add friends to see their activity here.</p>
      </div>
    </div>
  )
}

function Goals() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xs font-medium text-[#999] uppercase tracking-wider mb-3">Goals</h2>
      <div className="bg-white border border-[#ebebeb] p-4">
        <p className="text-sm text-[#999]">Set your active goals here.</p>
      </div>
    </div>
  )
}