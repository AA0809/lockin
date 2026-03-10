import { MODULES } from '../../App'

export default function Sidebar({ modules, activeModule, setActiveModule, isOpen, onClose, user, onSignOut }) {
  return (
    <aside className={`
      fixed top-0 left-0 h-full w-56 bg-white border-r border-[#ebebeb] z-30 flex flex-col
      transition-transform duration-200 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      lg:translate-x-0
    `}>
      {/* Logo */}
      <div className="px-5 py-4 border-b border-[#ebebeb]">
        <span className="text-base font-semibold tracking-tight text-[#111]">Lock In</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {modules.map(mod => (
          <button
            key={mod.id}
            onClick={() => setActiveModule(mod.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-left ${
              activeModule === mod.id
                ? 'bg-[#f0f0f0] text-[#111] font-medium'
                : 'text-[#666] hover:bg-[#f7f7f7] hover:text-[#111]'
            }`}
          >
            <span className="text-base">{mod.icon}</span>
            <span>{mod.label}</span>
          </button>
        ))}

        {/* Divider for custom tabs later */}
        <div className="pt-3 mt-3 border-t border-[#ebebeb]">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#999] hover:text-[#111] transition-colors text-left">
            <span className="text-base">+</span>
            <span>Add module</span>
          </button>
        </div>
      </nav>

      {/* User */}
      <div className="px-4 py-3 border-t border-[#ebebeb]">
        <p className="text-xs text-[#999] truncate">{user?.email}</p>
        <button
          onClick={onSignOut}
          className="text-xs text-[#999] hover:text-[#111] transition-colors mt-1"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}