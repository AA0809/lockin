import { useState } from 'react'
import SubTabs from '../components/ui/SubTabs'
import StudySession from '../components/study/StudySession'
import StudyLog from '../components/study/StudyLog'

const TABS = [
  { id: 'session', label: 'Session' },
  { id: 'log', label: 'Log' },
]

export default function StudyPage() {
  const [tab, setTab] = useState('session')
  return (
    <div>
      <SubTabs tabs={TABS} activeTab={tab} setActiveTab={setTab} />
      <div className="p-4 sm:p-6">
        {tab === 'session' && <StudySession />}
        {tab === 'log' && <StudyLog />}
      </div>
    </div>
  )
}