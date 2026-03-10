import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

function formatDuration(minutes) {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short'
  })
}

const MODE_LABELS = { countdown: 'Countdown', freeform: 'Free', pomodoro: 'Pomodoro' }

export default function StudyLog() {
  const [sessions, setSessions] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterSubject, setFilterSubject] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [statsPeriod, setStatsPeriod] = useState('week') // week | month | all

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: s }, { data: subs }] = await Promise.all([
      supabase.from('study_sessions')
        .select('*, study_blocks(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('study_subjects')
        .select('*').eq('user_id', user.id).order('name')
    ])
    setSessions(s || [])
    setSubjects(subs || [])
    setLoading(false)
  }

  // Filter sessions by period for stats
  function sessionsInPeriod() {
    const now = new Date()
    return sessions.filter(s => {
      if (statsPeriod === 'all') return true
      const d = new Date(s.date + 'T12:00:00')
      if (statsPeriod === 'week') {
        const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
        return d >= weekAgo
      }
      if (statsPeriod === 'month') {
        const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1)
        return d >= monthAgo
      }
      return true
    })
  }

  const periodSessions = sessionsInPeriod()

  // Subject stats for selected period
  const subjectStats = subjects.map(sub => {
    const allBlocks = periodSessions.flatMap(s => s.study_blocks || [])
    const subBlocks = allBlocks.filter(b => b.subject_id === sub.id)
    const totalMins = subBlocks.reduce((sum, b) => sum + (b.duration_minutes || 0), 0)
    return { ...sub, totalMins, blockCount: subBlocks.length }
  }).filter(s => s.blockCount > 0).sort((a, b) => b.totalMins - a.totalMins)

  // Total period time for bar chart percentages
  const maxMins = subjectStats.length > 0 ? Math.max(...subjectStats.map(s => s.totalMins)) : 1

  const filteredSessions = filterSubject
    ? sessions.filter(s => s.study_blocks?.some(b => b.subject_id === filterSubject))
    : sessions

  if (loading) return <p className="text-sm text-[#999]">Loading...</p>

  return (
    <div className="max-w-2xl space-y-6">

      {/* Subject breakdown */}
      {subjects.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-[#999] uppercase tracking-wider">Subject breakdown</p>
            <div className="flex gap-1">
              {['week','month','all'].map(p => (
                <button key={p} onClick={() => setStatsPeriod(p)}
                  className={`px-2 py-0.5 text-xs border transition-colors ${statsPeriod === p ? 'bg-[#111] text-white border-[#111]' : 'border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                  {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'All time'}
                </button>
              ))}
            </div>
          </div>

          {subjectStats.length === 0 ? (
            <p className="text-xs text-[#bbb]">No study data for this period.</p>
          ) : (
            <div className="space-y-2">
              {subjectStats.map(sub => (
                <button key={sub.id}
                  onClick={() => setFilterSubject(filterSubject === sub.id ? null : sub.id)}
                  className={`w-full text-left p-3 border transition-colors ${filterSubject === sub.id ? 'border-[#111]' : 'border-[#ebebeb] hover:border-[#999]'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-medium ${filterSubject === sub.id ? 'text-[#111]' : 'text-[#333]'}`}>{sub.name}</span>
                    <span className="text-xs text-[#999]">{formatDuration(sub.totalMins)}</span>
                  </div>
                  {/* Bar */}
                  <div className="h-1 bg-[#f0f0f0] w-full">
                    <div
                      className="h-1 bg-[#111] transition-all"
                      style={{ width: `${Math.round((sub.totalMins / maxMins) * 100)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sessions list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-[#999] uppercase tracking-wider">
            {filterSubject ? `${subjects.find(s => s.id === filterSubject)?.name} sessions` : 'All sessions'}
          </p>
          {filterSubject && (
            <button onClick={() => setFilterSubject(null)} className="text-xs text-[#999] hover:text-[#111]">
              Clear filter ✕
            </button>
          )}
        </div>

        {filteredSessions.length === 0 && (
          <p className="text-sm text-[#999]">No sessions yet.</p>
        )}

        <div className="space-y-2">
          {filteredSessions.map(session => {
            const isOpen = expanded[session.id]
            const blocks = (session.study_blocks || [])
              .filter(b => !filterSubject || b.subject_id === filterSubject)
              .sort((a, b) => a.order_index - b.order_index)

            return (
              <div key={session.id} className="bg-white border border-[#ebebeb]">
                <button
                  onClick={() => setExpanded(e => ({ ...e, [session.id]: !e[session.id] }))}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-[#f9f9f9] transition-colors">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-[#111]">{formatDate(session.date)}</p>
                      {session.rating && (
                        <span className="text-xs text-[#bbb]">{'★'.repeat(session.rating)}</span>
                      )}
                      {session.goal_achieved === true && <span className="text-xs text-[#16a34a]">✓ goal</span>}
                      {session.goal_achieved === false && <span className="text-xs text-[#bbb]">✗ goal</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-[#999]">{formatDuration(session.total_minutes)}</p>
                      {session.timer_mode && <span className="text-xs text-[#bbb]">{MODE_LABELS[session.timer_mode]}</span>}
                      {session.study_blocks?.length > 0 && (
                        <span className="text-xs text-[#bbb]">{session.study_blocks.length} blocks</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[#ccc] text-xs transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </button>

                {isOpen && (
                  <div className="border-t border-[#ebebeb] p-3 space-y-2">
                    {session.goal && (
                      <p className="text-xs text-[#666]">
                        <span className="text-[#bbb]">Goal: </span>{session.goal}
                      </p>
                    )}
                    {session.notes && (
                      <p className="text-xs text-[#666] whitespace-pre-wrap">{session.notes}</p>
                    )}
                    {blocks.length > 0 ? (
                      <div className="space-y-1">
                        {blocks.map(b => (
                          <div key={b.id} className="flex items-start justify-between py-1.5 border-t border-[#f5f5f5] first:border-t-0">
                            <div>
                              <p className="text-xs font-medium text-[#111]">{b.subject_name || 'General'}</p>
                              {b.notes && <p className="text-xs text-[#999] mt-0.5">{b.notes}</p>}
                            </div>
                            <span className="text-xs text-[#bbb] shrink-0 ml-3">{formatDuration(b.duration_minutes)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#bbb]">No subject blocks logged.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}