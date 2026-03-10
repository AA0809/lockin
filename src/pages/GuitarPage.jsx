import { useState } from 'react'
import SubTabs from '../components/ui/SubTabs'
import Practice from '../components/guitar/Practice'
import Repertoire from '../components/guitar/Repertoire'
import Techniques from '../components/guitar/Techniques'

const TABS = [
  { id: 'practice', label: 'Practice' },
  { id: 'repertoire', label: 'Repertoire' },
  { id: 'techniques', label: 'Techniques' },
]

export default function GuitarPage() {
  const [tab, setTab] = useState('practice')

  return (
    <div>
      <SubTabs tabs={TABS} activeTab={tab} setActiveTab={setTab} />
      <div className="p-4 sm:p-6">
        {tab === 'practice' && <Practice />}
        {tab === 'repertoire' && <Repertoire />}
        {tab === 'techniques' && <Techniques />}
      </div>
    </div>
  )
}