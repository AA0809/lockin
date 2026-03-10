import { useState } from 'react'
import SubTabs from '../components/ui/SubTabs'
import PresetManager from '../components/gym/PresetManager'
import ActiveSession from '../components/gym/ActiveSession'
import GymHistory from '../components/gym/GymHistory'

const TABS = [
  { id: 'session', label: 'Session' },
  { id: 'history', label: 'History' },
  { id: 'stats', label: 'Stats' },
]

export default function GymPage() {
  const [activeTab, setActiveTab] = useState('session')
  const [activeSession, setActiveSession] = useState(null)

  return (
    <div>
      {!activeSession && (
        <SubTabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
      )}
      <div className="p-4 lg:p-6">
        {activeSession ? (
          <ActiveSession
            preset={activeSession === 'freeform' ? null : activeSession}
            onFinish={() => { setActiveSession(null); setActiveTab('history') }}
            onCancel={() => setActiveSession(null)}
          />
        ) : (
          <>
            {activeTab === 'session' && <PresetManager onStartSession={(p) => setActiveSession(p || 'freeform')} />}
            {activeTab === 'history' && <GymHistory />}
            {activeTab === 'stats' && <p className="text-sm text-[#999]">Stats coming soon.</p>}
          </>
        )}
      </div>
    </div>
  )
}