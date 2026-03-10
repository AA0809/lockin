import { useState } from 'react'
import SubTabs from '../components/ui/SubTabs'

const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'done', label: 'Done' },
]

export default function ProjectsPage() {
  const [activeTab, setActiveTab] = useState('active')
  return (
    <div>
      <SubTabs tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="p-6">
        {activeTab === 'active' && <p className="text-sm text-[#999]">Your active projects.</p>}
        {activeTab === 'done' && <p className="text-sm text-[#999]">Completed projects.</p>}
      </div>
    </div>
  )
}