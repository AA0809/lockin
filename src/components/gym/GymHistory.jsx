import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STRENGTH_CATS = ['weights', 'calisthenics']
const CARDIO_CATS = ['treadmill', 'distance', 'timeonly']
const CARDIO_LABELS = { treadmill: 'Treadmill', distance: 'Distance', timeonly: 'Time Only' }

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatDuration(minutes) {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h > 0 && m > 0) return `${h}h ${m}min`
  if (h > 0) return `${h}h`
  return `${m}min`
}

export default function GymHistory() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [filter, setFilter] = useState('all')
  const [presets, setPresets] = useState([])

  useEffect(() => {
    async function fetch() {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: sessData }, { data: presetData }] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select(`*, session_exercises(*, exercise_sets(*), cardio_entries(*))`)
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('workout_presets')
          .select('id, name')
          .eq('user_id', user.id)
      ])
      setSessions(sessData || [])
      setPresets(presetData || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'cardio', label: 'Cardio' },
    { id: 'freeform', label: 'Freeform' },
    ...presets.map(p => ({ id: p.id, label: p.name }))
  ]

  const filtered = sessions.filter(s => {
    if (filter === 'all') return true
    if (filter === 'cardio') {
      return s.session_exercises?.every(ex => CARDIO_CATS.includes(ex.category))
    }
    if (filter === 'freeform') return !s.preset_id
    return s.preset_id === filter
  })

  if (loading) return <p className="text-sm text-[#999]">Loading...</p>
  if (sessions.length === 0) return <p className="text-sm text-[#999]">No sessions logged yet.</p>

  return (
    <div className="max-w-2xl space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {filterTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-3 py-1 text-xs transition-colors ${
              filter === tab.id
                ? 'bg-[#111] text-white'
                : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-[#999]">No sessions for this filter.</p>
      )}

      {filtered.map(session => {
        // Count exercises that have actual logged data
        const exercises = session.session_exercises || []
        const validExercises = exercises.filter(ex => {
          if (STRENGTH_CATS.includes(ex.category)) {
            return ex.category === 'weights'
              ? ex.exercise_sets?.some(s => s.reps && s.weight_kg)
              : ex.exercise_sets?.some(s => s.reps)
          }
          return ex.cardio_entries?.length > 0
        })
        if (validExercises.length === 0) return null

        return (
          <div key={session.id} className="bg-white border border-[#ebebeb]">
            <button
              onClick={() => setExpanded(expanded === session.id ? null : session.id)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div>
                <p className="text-sm font-medium text-[#111]">{session.name}</p>
                <p className="text-xs text-[#999] mt-0.5">{validExercises.length} exercises</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-[#999]">{formatDate(session.date)}</p>
                <span className="text-[#ccc] text-xs">{expanded === session.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded === session.id && (
              <div className="border-t border-[#ebebeb] px-4 py-3 space-y-4">
                {validExercises
                  .sort((a, b) => a.order_index - b.order_index)
                  .map(ex => {
                    const isCalisthenics = ex.category === 'calisthenics'
                    const isCardio = CARDIO_CATS.includes(ex.category)
                    const validSets = ex.exercise_sets?.filter(s =>
                      isCalisthenics ? s.reps : (s.reps && s.weight_kg)
                    ).sort((a, b) => a.set_number - b.set_number)

                    return (
                      <div key={ex.id}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-[#111]">{ex.name}</p>
                          <span className="text-xs text-[#bbb] capitalize">
                            {isCardio ? (CARDIO_LABELS[ex.category] || ex.category) : ex.category}
                          </span>
                        </div>

                        {!isCardio && validSets?.length > 0 && (
                          <div className="space-y-1">
                            {/* Always 3-col, weight col blank for calisthenics */}
                            <div className="grid grid-cols-3 gap-2 text-xs text-[#bbb] px-1">
                              <span>#</span>
                              <span>{isCalisthenics ? '' : 'kg'}</span>
                              <span>Reps</span>
                            </div>
                            {validSets.map(set => (
                              <div key={set.id} className="grid grid-cols-3 gap-2 text-xs text-[#444] px-1">
                                <span>{set.set_number}</span>
                                <span>{isCalisthenics ? '—' : (set.weight_kg ?? '—')}</span>
                                <span>{set.reps ?? '—'}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {isCardio && ex.cardio_entries?.[0] && (
                          <div className="text-xs text-[#666] space-y-0.5 px-1">
                            {ex.cardio_entries[0].duration_minutes != null && (
                              <p>Duration: {formatDuration(ex.cardio_entries[0].duration_minutes)}</p>
                            )}
                            {ex.cardio_entries[0].distance_km != null && (
                              <p>Distance: {ex.cardio_entries[0].distance_km} km</p>
                            )}
                            {ex.cardio_entries[0].speed != null && (
                              <p>Speed: {ex.cardio_entries[0].speed} km/h</p>
                            )}
                            {ex.cardio_entries[0].incline != null && (
                              <p>Incline: {ex.cardio_entries[0].incline}%</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}