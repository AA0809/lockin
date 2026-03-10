export default function SubTabs({ tabs, activeTab, setActiveTab }) {
  return (
    <div className="flex border-b border-[#ebebeb] bg-white px-4 sticky top-12 lg:top-0 z-10">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === tab.id
              ? 'border-[#111] text-[#111]'
              : 'border-transparent text-[#999] hover:text-[#111]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}