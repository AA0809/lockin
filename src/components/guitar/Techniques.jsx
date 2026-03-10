import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDuration } from './GuitarShared'

function daysSince(dateStr) {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

export default function Techniques() {
  const [techniques, setTechniques] = useState([])
  const [styleTags, setStyleTags] = useState([])
  const [selected, setSelected] = useState(null)
  const [selectedType, setSelectedType] = useState(null) // 'technique' or 'style'
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const [{ data: techs }, { data: styles }] = await Promise.all([
      supabase.from('guitar_techniques').select('*').eq('user_id', user.id).order('name'),
      supabase.from('style_tags').select('*').eq('user_id', user.id).order('name')
    ])

    // Get last practiced date and best BPM for each technique
    const techsWithData = await Promise.all((techs || []).map(async tech => {
      const { data: exEntries } = await supabase
        .from('exercise_technique_tags')
        .select(`technique_id, block_exercise_entries(bpm, practice_blocks(started_at))`)
        .eq('technique_id', tech.id)
        .order('created_at', { ascending: false })

      const { data: theoryEntries } = await supabase
        .from('theory_technique_tags')
        .select(`technique_id, practice_blocks(started_at)`)
        .eq('technique_id', tech.id)
        .order('created_at', { ascending: false })

      const allDates = [
        ...(exEntries || []).map(e => e.block_exercise_entries?.practice_blocks?.started_at),
        ...(theoryEntries || []).map(e => e.practice_blocks?.started_at)
      ].filter(Boolean).sort().reverse()

      const bpms = (exEntries || []).map(e => e.block_exercise_entries?.bpm).filter(Boolean)
      const bestBpm = bpms.length > 0 ? Math.max(...bpms) : null

      return { ...tech, lastPracticed: allDates[0] || null, bestBpm }
    }))

    // Get last used date for style tags
    const stylesWithData = await Promise.all((styles || []).map(async style => {
      const { data } = await supabase
        .from('creative_style_tags')
        .select(`style_tag_id, practice_blocks(started_at, duration_minutes)`)
        .eq('style_tag_id', style.id)
        .order('created_at', { ascending: false })

      const dates = (data || []).map(e => e.practice_blocks?.started_at).filter(Boolean)
      const totalMins = (data || []).reduce((sum, e) => sum + (e.practice_blocks?.duration_minutes || 0), 0)

      return { ...style, lastUsed: dates[0] || null, totalMinutes: totalMins, sessionCount: data?.length || 0 }
    }))

    setTechniques(techsWithData)
    setStyleTags(stylesWithData)
    setLoading(false)
  }

  if (loading) return <p className="text-sm text-[#999]">Loading...</p>

  if (selected && selectedType === 'technique') {
    return <TechniqueDetail
      techniqueId={selected}
      onBack={() => { setSelected(null); fetchAll() }}
    />
  }

  if (selected && selectedType === 'style') {
    return <StyleDetail
      styleTagId={selected}
      onBack={() => { setSelected(null); fetchAll() }}
    />
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Techniques */}
      <div>
        <p className="text-xs font-medium text-[#999] uppercase tracking-wider mb-2">Techniques</p>
        {techniques.length === 0 && (
          <p className="text-sm text-[#999]">No techniques yet. Tag exercises during practice to build this list.</p>
        )}
        <div className="space-y-2">
          {techniques.map(tech => {
            const days = daysSince(tech.lastPracticed)
            const stale = days !== null && days > 14
            return (
              <button key={tech.id} onClick={() => { setSelected(tech.id); setSelectedType('technique') }}
                className="w-full text-left bg-white border border-[#ebebeb] hover:border-[#111] transition-colors p-3 flex items-center gap-3">
                <div className={`w-1 self-stretch shrink-0 ${stale ? 'bg-amber-200' : days !== null ? 'bg-[#e0e0e0]' : 'bg-[#f0f0f0]'}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#111]">{tech.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {tech.bestBpm && <span className="text-xs text-[#bbb]">Best: {tech.bestBpm} BPM</span>}
                    {tech.lastPracticed && (
                      <span className={`text-xs ${stale ? 'text-amber-500' : 'text-[#bbb]'}`}>
                        {days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`}
                      </span>
                    )}
                    {!tech.lastPracticed && <span className="text-xs text-[#bbb]">Not practiced yet</span>}
                  </div>
                  {tech.personal_notes && (
                    <p className="text-xs text-[#999] mt-1 truncate">{tech.personal_notes}</p>
                  )}
                </div>
                <span className="text-[#ccc] text-xs">›</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Creative / Style */}
      {styleTags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[#999] uppercase tracking-wider mb-2">Creative Practice</p>
          <div className="space-y-2">
            {styleTags.map(style => (
              <button key={style.id} onClick={() => { setSelected(style.id); setSelectedType('style') }}
                className="w-full text-left bg-white border border-[#ebebeb] hover:border-[#111] transition-colors p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#111]">{style.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {style.totalMinutes > 0 && <span className="text-xs text-[#bbb]">{formatDuration(style.totalMinutes)} total</span>}
                    {style.sessionCount > 0 && <span className="text-xs text-[#bbb]">{style.sessionCount} sessions</span>}
                  </div>
                </div>
                <span className="text-[#ccc] text-xs">›</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TechniqueDetail({ techniqueId, onBack }) {
  const [tech, setTech] = useState(null)
  const [exHistory, setExHistory] = useState([])
  const [theoryHistory, setTheoryHistory] = useState([])
  const [linkedSongs, setLinkedSongs] = useState([])
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [techniqueId])

  async function fetchData() {
    const [{ data: t }, { data: ex }, { data: theory }] = await Promise.all([
      supabase.from('guitar_techniques').select('*').eq('id', techniqueId).single(),
      supabase.from('exercise_technique_tags')
        .select(`block_exercise_entries(bpm, notes, guitar_exercises(name), practice_blocks(started_at, duration_minutes, guitar_sessions(date)))`)
        .eq('technique_id', techniqueId)
        .order('created_at', { ascending: false }),
      supabase.from('theory_technique_tags')
        .select(`practice_blocks(notes, started_at, duration_minutes, guitar_sessions(date))`)
        .eq('technique_id', techniqueId)
        .order('created_at', { ascending: false })
    ])

    setTech(t)
    setNotes(t?.personal_notes || '')
    setExHistory(ex || [])
    setTheoryHistory(theory || [])
    setLoading(false)
  }

  async function saveNotes() {
    await supabase.from('guitar_techniques').update({ personal_notes: notes }).eq('id', techniqueId)
    setEditingNotes(false)
  }

  if (loading) return <p className="text-sm text-[#999]">Loading...</p>
  if (!tech) return null

  const bpms = exHistory.map(e => e.block_exercise_entries?.bpm).filter(Boolean)
  const bestBpm = bpms.length ? Math.max(...bpms) : null

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  return (
    <div className="max-w-2xl space-y-5">
      <button onClick={onBack} className="text-xs text-[#999] hover:text-[#111]">← Techniques</button>

      <div>
        <h2 className="text-base font-semibold text-[#111]">{tech.name}</h2>
        {bestBpm && <p className="text-sm text-[#999] mt-0.5">Best: {bestBpm} BPM</p>}
      </div>

      {/* Personal notes */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-[#999] uppercase tracking-wider">Your notes</p>
          {!editingNotes && <button onClick={() => setEditingNotes(true)} className="text-xs text-[#999] hover:text-[#111]">Edit</button>}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Focus points, things to work on, reminders..."
              className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111] resize-none"
            />
            <div className="flex gap-2">
              <button onClick={saveNotes} className="px-3 py-1.5 bg-[#111] text-white text-xs">Save</button>
              <button onClick={() => { setEditingNotes(false); setNotes(tech.personal_notes || '') }} className="text-xs text-[#999]">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#666] whitespace-pre-wrap">{notes || <span className="text-[#bbb]">No notes yet.</span>}</p>
        )}
      </div>

      {/* Exercise history */}
      {exHistory.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[#999] uppercase tracking-wider mb-2">Exercise History</p>
          <div className="space-y-1">
            {exHistory.map((entry, i) => {
              const ex = entry.block_exercise_entries
              const date = ex?.practice_blocks?.guitar_sessions?.date
              return (
                <div key={i} className="flex items-center justify-between p-2 bg-[#f9f9f9] text-xs">
                  <div>
                    <span className="text-[#111] font-medium">{ex?.guitar_exercises?.name || 'Unknown'}</span>
                    <span className="text-[#bbb] ml-2">{formatDate(date)}</span>
                    {ex?.notes && <p className="text-[#999] mt-0.5">{ex.notes}</p>}
                  </div>
                  {ex?.bpm && <span className="text-[#999]">{ex.bpm} BPM</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Theory history */}
      {theoryHistory.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[#999] uppercase tracking-wider mb-2">Theory Sessions</p>
          <div className="space-y-2">
            {theoryHistory.map((entry, i) => {
              const block = entry.practice_blocks
              const date = block?.guitar_sessions?.date
              return (
                <div key={i} className="p-3 bg-[#f9f9f9] text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[#bbb]">{formatDate(date)}</span>
                    {block?.duration_minutes && <span className="text-[#bbb]">{formatDuration(block.duration_minutes)}</span>}
                  </div>
                  {block?.notes && <p className="text-[#666] whitespace-pre-wrap">{block.notes}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {exHistory.length === 0 && theoryHistory.length === 0 && (
        <p className="text-sm text-[#bbb]">No practice history yet for this technique.</p>
      )}
    </div>
  )
}

function StyleDetail({ styleTagId, onBack }) {
  const [tag, setTag] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('style_tags').select('*').eq('id', styleTagId).single(),
        supabase.from('creative_style_tags')
          .select(`practice_blocks(notes, started_at, duration_minutes, guitar_sessions(date))`)
          .eq('style_tag_id', styleTagId)
          .order('created_at', { ascending: false })
      ])
      setTag(t)
      setSessions(s || [])
      setLoading(false)
    }
    fetch()
  }, [styleTagId])

  if (loading) return <p className="text-sm text-[#999]">Loading...</p>
  if (!tag) return null

  const totalMins = sessions.reduce((sum, s) => sum + (s.practice_blocks?.duration_minutes || 0), 0)

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  return (
    <div className="max-w-2xl space-y-5">
      <button onClick={onBack} className="text-xs text-[#999] hover:text-[#111]">← Techniques</button>

      <div>
        <h2 className="text-base font-semibold text-[#111]">{tag.name}</h2>
        <div className="flex gap-4 mt-1">
          <p className="text-xs text-[#999]">{sessions.length} sessions</p>
          {totalMins > 0 && <p className="text-xs text-[#999]">{formatDuration(totalMins)} total</p>}
        </div>
      </div>

      <div className="space-y-2">
        {sessions.map((entry, i) => {
          const block = entry.practice_blocks
          const date = block?.guitar_sessions?.date
          return (
            <div key={i} className="p-3 bg-[#f9f9f9] space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#bbb]">{formatDate(date)}</span>
                {block?.duration_minutes && <span className="text-[#bbb]">{formatDuration(block.duration_minutes)}</span>}
              </div>
              {block?.notes && <p className="text-sm text-[#666] whitespace-pre-wrap">{block.notes}</p>}
            </div>
          )
        })}
      </div>

      {sessions.length === 0 && (
        <p className="text-sm text-[#bbb]">No sessions logged yet for this style.</p>
      )}
    </div>
  )
}
