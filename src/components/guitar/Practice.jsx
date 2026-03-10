import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { TagInput, BpmInput, StarRating, formatDuration } from './GuitarShared'
import { AddSongModal } from './Repertoire'

export default function Practice() {
  const [activeSession, setActiveSession] = useState(null)
  const [recentSessions, setRecentSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchRecent() }, [])

  async function fetchRecent() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('guitar_sessions')
      .select('*, practice_blocks(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
    setRecentSessions(data || [])
    setLoading(false)
  }

  if (activeSession) {
    return <ActiveGuitarSession
      session={activeSession}
      onEnd={() => { setActiveSession(null); fetchRecent() }}
    />
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-[#999] uppercase tracking-wider">Practice</h2>
      </div>

      <button
        onClick={() => setActiveSession('new')}
        className="w-full p-5 bg-[#111] text-white hover:bg-[#333] transition-colors text-left"
      >
        <p className="text-sm font-medium">Start session</p>
        <p className="text-xs text-[#999] mt-0.5">Log blocks as you practice</p>
      </button>

      {recentSessions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[#999] uppercase tracking-wider mb-2">Recent sessions</p>
          <div className="space-y-2">
            {recentSessions.map(s => (
              <div key={s.id} className="bg-white border border-[#ebebeb] p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#111]">
                    {new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-xs text-[#999] mt-0.5">
                    {s.practice_blocks?.length || 0} blocks
                    {s.total_minutes ? ` · ${formatDuration(s.total_minutes)}` : ''}
                  </p>
                </div>
                {s.rating && (
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(n => (
                      <span key={n} className={`text-sm ${n <= s.rating ? 'text-[#111]' : 'text-[#e0e0e0]'}`}>★</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActiveGuitarSession({ onEnd }) {
  const [sessionId, setSessionId] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [showBlockPicker, setShowBlockPicker] = useState(false)
  const [activeBlock, setActiveBlock] = useState(null) // block being logged
  const [paused, setPaused] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)
  const startTimeRef = useRef(Date.now())
  const pauseStartRef = useRef(null)
  const totalPausedRef = useRef(0)

  useEffect(() => {
    initSession()
  }, [])

  async function initSession() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('guitar_sessions').insert({
      user_id: user.id,
      date: new Date().toISOString().split('T')[0],
      started_at: new Date().toISOString()
    }).select().single()
    setSessionId(data.id)
  }

  function handlePause() {
    if (!paused) {
      pauseStartRef.current = Date.now()
      setPaused(true)
    } else {
      totalPausedRef.current += Date.now() - pauseStartRef.current
      pauseStartRef.current = null
      setPaused(false)
    }
  }

  function getTotalMinutes() {
    const pausedNow = paused && pauseStartRef.current ? Date.now() - pauseStartRef.current : 0
    const elapsed = Date.now() - startTimeRef.current - totalPausedRef.current - pausedNow
    return Math.round(elapsed / 60000)
  }

  function addBlock(type) {
    const block = {
      tempId: `b-${Date.now()}`,
      type,
      startedAt: Date.now(),
      endedAt: null,
      duration: null,
      // type-specific fields
      songs: type === 'song' ? [makeSongEntry()] : [],
      exercise: type === 'exercise' ? makeExerciseEntry() : null,
      notes: '',
      styleTags: [],
      techniqueTags: [],
      theoryTopic: '',
      theorySummary: '',
      rating: null,
    }
    setBlocks(prev => [...prev, block])
    setActiveBlock(block.tempId)
    setShowBlockPicker(false)
  }

  function makeSongEntry() {
    return { id: `se-${Date.now()}-${Math.random()}`, song: null, part: null, bpm: '', percentage: '', notes: '', techniques: [] }
  }

  function makeExerciseEntry() {
    return { exercise: null, bpm: '', techniques: [], notes: '' }
  }

  function updateBlock(tempId, updates) {
    setBlocks(prev => prev.map(b => b.tempId === tempId ? { ...b, ...updates } : b))
  }

  function endBlock(tempId) {
    const now = Date.now()
    setBlocks(prev => prev.map(b => {
      if (b.tempId !== tempId) return b
      const mins = Math.round((now - b.startedAt) / 60000)
      return { ...b, endedAt: now, duration: mins || 1 }
    }))
    setActiveBlock(null)
  }

  async function finishSession(rating, reviewNotes) {
    if (!sessionId) return
    const totalMins = getTotalMinutes()

    await supabase.from('guitar_sessions').update({
      ended_at: new Date().toISOString(),
      total_minutes: totalMins,
      rating,
      review_notes: reviewNotes,
      paused_seconds: Math.round(totalPausedRef.current / 1000)
    }).eq('id', sessionId)

    // Save all blocks
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      const { data: block } = await supabase.from('practice_blocks').insert({
        session_id: sessionId,
        block_type: b.type,
        started_at: new Date(b.startedAt).toISOString(),
        ended_at: b.endedAt ? new Date(b.endedAt).toISOString() : new Date().toISOString(),
        duration_minutes: b.duration || 1,
        notes: b.notes || null,
        order_index: i
      }).select().single()

      if (!block) continue

      if (b.type === 'song') {
        for (const entry of b.songs) {
          if (!entry.song) continue
          const bpmVal = entry.bpm ? parseInt(entry.bpm) : null
          const pctVal = entry.percentage ? parseInt(entry.percentage) : null

          const { data: songEntry } = await supabase.from('block_song_entries').insert({
            block_id: block.id,
            song_id: entry.song.id,
            part_id: entry.part?.id || null,
            bpm: bpmVal,
            percentage: pctVal,
            notes: entry.notes || null
          }).select().single()

          // Save technique tags from song entry
          if (songEntry && entry.techniques?.length > 0) {
            await supabase.from('exercise_technique_tags').insert(
              entry.techniques.map(t => ({ exercise_entry_id: songEntry.id, technique_id: t.id }))
            )
          }

          // Update song's current BPM if higher
          if (bpmVal) {
            const { data: song } = await supabase.from('songs').select('current_bpm').eq('id', entry.song.id).single()
            if (!song.current_bpm || bpmVal > song.current_bpm) {
              await supabase.from('songs').update({ current_bpm: bpmVal, status: 'learning' }).eq('id', entry.song.id)
            }
            // Update part BPM too
            if (entry.part?.id) {
              const { data: part } = await supabase.from('song_parts').select('current_bpm').eq('id', entry.part.id).single()
              if (!part.current_bpm || bpmVal > part.current_bpm) {
                await supabase.from('song_parts').update({ current_bpm: bpmVal }).eq('id', entry.part.id)
              }
            }
          }
        }
      }

      if (b.type === 'exercise' && b.exercise?.exercise) {
        const { data: exEntry } = await supabase.from('block_exercise_entries').insert({
          block_id: block.id,
          exercise_id: b.exercise.exercise.id,
          bpm: b.exercise.bpm ? parseInt(b.exercise.bpm) : null,
          notes: b.exercise.notes || null
        }).select().single()

        if (exEntry && b.exercise.techniques?.length > 0) {
          await supabase.from('exercise_technique_tags').insert(
            b.exercise.techniques.map(t => ({ exercise_entry_id: exEntry.id, technique_id: t.id }))
          )
        }
      }

      if (b.type === 'theory' && b.techniqueTags?.length > 0) {
        await supabase.from('theory_technique_tags').insert(
          b.techniqueTags.map(t => ({ block_id: block.id, technique_id: t.id }))
        )
      }

      if (b.type === 'creative' && b.styleTags?.length > 0) {
        await supabase.from('creative_style_tags').insert(
          b.styleTags.map(t => ({ block_id: block.id, style_tag_id: t.id }))
        )
      }
    }

    onEnd()
  }

  return (
    <div className="max-w-2xl space-y-4 pb-24">
      {/* Session active pill */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium ${paused ? 'bg-[#f0f0f0] text-[#999]' : 'bg-[#111] text-white'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-[#bbb]' : 'bg-white'}`} />
          {paused ? 'Session paused' : 'Session active'}
        </div>
        <div className="flex gap-2">
          <button onClick={handlePause}
            className="text-xs px-3 py-1.5 border border-[#ebebeb] text-[#666] hover:border-[#111] transition-colors">
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={() => setShowEndModal(true)}
            className="text-xs px-3 py-1.5 bg-[#111] text-white hover:bg-[#333] transition-colors">
            End session
          </button>
        </div>
      </div>

      {/* Blocks */}
      {blocks.map(block => (
        <BlockCard
          key={block.tempId}
          block={block}
          isActive={activeBlock === block.tempId}
          onUpdate={updates => updateBlock(block.tempId, updates)}
          onEnd={() => endBlock(block.tempId)}
          onReopen={() => setActiveBlock(block.tempId)}
          sessionId={sessionId}
        />
      ))}

      {/* Block picker */}
      {showBlockPicker ? (
        <div className="bg-white border border-[#111] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Add block</p>
            <button onClick={() => setShowBlockPicker(false)} className="text-xs text-[#999]">Cancel</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { type: 'song', label: 'Song', desc: 'Songs you practiced' },
              { type: 'exercise', label: 'Exercise', desc: 'Drills and technique work' },
              { type: 'creative', label: 'Creative', desc: 'Improvisation, composition' },
              { type: 'theory', label: 'Theory', desc: 'Concepts and knowledge' },
            ].map(({ type, label, desc }) => (
              <button key={type} onClick={() => addBlock(type)}
                className="p-3 border border-[#ebebeb] hover:border-[#111] text-left transition-colors">
                <p className="text-sm font-medium text-[#111]">{label}</p>
                <p className="text-xs text-[#bbb] mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button onClick={() => setShowBlockPicker(true)}
          className="w-full py-4 border border-dashed border-[#ddd] text-sm text-[#999] hover:border-[#111] hover:text-[#111] transition-colors font-medium">
          + Add block
        </button>
      )}

      {showEndModal && (
        <EndSessionModal
          onConfirm={finishSession}
          onCancel={() => setShowEndModal(false)}
          blockCount={blocks.length}
          totalMinutes={getTotalMinutes()}
        />
      )}
    </div>
  )
}

function BlockCard({ block, isActive, onUpdate, onEnd, onReopen, sessionId }) {
  const BLOCK_LABELS = { song: 'Song', exercise: 'Exercise', creative: 'Creative', theory: 'Theory' }

  return (
    <div className={`bg-white border ${isActive ? 'border-[#111]' : 'border-[#ebebeb]'}`}>
      <div className="flex items-center justify-between p-3 border-b border-[#ebebeb]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#111]">{BLOCK_LABELS[block.type]}</span>
          {block.duration && (
            <span className="text-xs text-[#bbb]">{formatDuration(block.duration)}</span>
          )}
        </div>
        {isActive ? (
          <button onClick={onEnd} className="text-xs px-2 py-1 bg-[#111] text-white hover:bg-[#333]">Done</button>
        ) : (
          <button onClick={onReopen} className="text-xs text-[#999] hover:text-[#111]">Edit</button>
        )}
      </div>

      <div className="p-3">
        {block.type === 'song' && (
          <SongBlockContent block={block} onUpdate={onUpdate} sessionId={sessionId} />
        )}
        {block.type === 'exercise' && (
          <ExerciseBlockContent block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'creative' && (
          <CreativeBlockContent block={block} onUpdate={onUpdate} />
        )}
        {block.type === 'theory' && (
          <TheoryBlockContent block={block} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  )
}

function SongBlockContent({ block, onUpdate, sessionId }) {
  const [songs, setSongs] = useState([])
  const [addingSongToLibrary, setAddingSongToLibrary] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase.from('songs').select('*, song_parts(*)').eq('user_id', user.id).order('title')
      setSongs(data || [])
    }
    load()
  }, [addingSongToLibrary])

  function addSongEntry() {
    onUpdate({ songs: [...block.songs, { id: `se-${Date.now()}`, song: null, part: null, bpm: '', percentage: '', notes: '', techniques: [] }] })
  }

  function updateEntry(id, updates) {
    onUpdate({ songs: block.songs.map(e => e.id === id ? { ...e, ...updates } : e) })
  }

  function removeEntry(id) {
    onUpdate({ songs: block.songs.filter(e => e.id !== id) })
  }

  return (
    <div className="space-y-4">
      {block.songs.map((entry, idx) => (
        <div key={entry.id} className="space-y-2">
          {idx > 0 && <div className="border-t border-[#f0f0f0] pt-3" />}

          <div className="flex items-center gap-2">
            <select value={entry.song?.id || ''}
              onChange={e => {
                const s = songs.find(s => s.id === e.target.value)
                // Auto-load technique tags from song if no parts
                const autoTechs = s && (!s.song_parts || s.song_parts.length === 0) ? [] : []
                updateEntry(entry.id, { song: s || null, part: null, bpm: '', percentage: '', techniques: autoTechs })
              }}
              className="flex-1 px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]">
              <option value="">Select song...</option>
              {songs.map(s => <option key={s.id} value={s.id}>{s.title}{s.artist ? ` — ${s.artist}` : ''}</option>)}
            </select>
            {block.songs.length > 1 && (
              <button onClick={() => removeEntry(entry.id)} className="text-[#ccc] hover:text-red-400 text-xs shrink-0">✕</button>
            )}
          </div>

          {entry.song?.song_parts?.length > 0 && (
            <select value={entry.part?.id || ''}
              onChange={e => {
                const p = entry.song.song_parts.find(p => p.id === e.target.value)
                // Auto-populate techniques from part tags
                const techs = p?.technique_tags || []
                updateEntry(entry.id, { part: p || null, techniques: techs })
              }}
              className="w-full px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]">
              <option value="">Whole song / no specific part</option>
              {entry.song.song_parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {entry.song && (
            <BpmInput
              bpm={entry.bpm} percentage={entry.percentage}
              targetBpm={entry.part?.target_bpm || entry.song?.target_bpm}
              onBpmChange={v => updateEntry(entry.id, { bpm: v })}
              onPercentageChange={v => updateEntry(entry.id, { percentage: v })}
            />
          )}

          {entry.song && (
            <div>
              <p className="text-xs text-[#bbb] mb-1">Techniques <span className="text-[#ccc]">(auto-filled from part, editable)</span></p>
              <TagInput tableName="guitar_techniques" labelField="name"
                selected={entry.techniques || []}
                onChange={v => updateEntry(entry.id, { techniques: v })}
                placeholder="Add technique..."
              />
            </div>
          )}

          {entry.song && (
            <input value={entry.notes} onChange={e => updateEntry(entry.id, { notes: e.target.value })}
              placeholder="Note (optional)..."
              className="w-full px-2 py-1 border border-[#ebebeb] text-xs focus:outline-none focus:border-[#111]"
            />
          )}
        </div>
      ))}

      <div className="flex gap-3 pt-1">
        <button onClick={addSongEntry} className="text-xs text-[#999] hover:text-[#111]">+ Add another song</button>
        <button onClick={() => setAddingSongToLibrary(true)} className="text-xs text-[#4F46E5] hover:underline">+ New song to library</button>
      </div>

      {addingSongToLibrary && (
        <AddSongModal onSave={() => setAddingSongToLibrary(false)} onCancel={() => setAddingSongToLibrary(false)} />
      )}
    </div>
  )
}

function ExerciseBlockContent({ block, onUpdate }) {
  const [exercises, setExercises] = useState([])
  const [search, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(!block.exercise?.exercise)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase.from('guitar_exercises').select('*').eq('user_id', user.id).order('name')
      setExercises(data || [])
    }
    load()
  }, [])

  async function selectOrCreate(name) {
    let ex = exercises.find(e => e.name.toLowerCase() === name.toLowerCase())
    if (!ex) {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase.from('guitar_exercises')
        .upsert({ user_id: user.id, name: name.trim() }, { onConflict: 'user_id,name' })
        .select().single()
      ex = data
      setExercises(prev => [...prev, ex])
    }
    onUpdate({ exercise: { ...block.exercise, exercise: ex } })
    setShowPicker(false)
    setSearch('')
  }

  const filtered = exercises.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-3">
      {showPicker ? (
        <div className="space-y-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or type exercise name..." autoFocus
            className="w-full px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
          />
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {search && !filtered.find(e => e.name.toLowerCase() === search.toLowerCase()) && (
              <button onClick={() => selectOrCreate(search)} className="w-full text-left px-2 py-1.5 text-sm text-[#4F46E5] hover:bg-[#f7f7f7]">
                + Create "{search}"
              </button>
            )}
            {filtered.map(e => (
              <button key={e.id} onClick={() => selectOrCreate(e.name)} className="w-full text-left px-2 py-1.5 text-sm text-[#111] hover:bg-[#f7f7f7]">
                {e.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[#111] flex-1">{block.exercise?.exercise?.name}</p>
          <button onClick={() => setShowPicker(true)} className="text-xs text-[#999] hover:text-[#111]">Change</button>
        </div>
      )}

      {block.exercise?.exercise && (
        <>
          <BpmInput
            bpm={block.exercise.bpm}
            percentage={null}
            targetBpm={null}
            onBpmChange={v => onUpdate({ exercise: { ...block.exercise, bpm: v } })}
            onPercentageChange={() => {}}
          />
          <div>
            <p className="text-xs text-[#bbb] mb-1">Techniques</p>
            <TagInput
              tableName="guitar_techniques"
              labelField="name"
              selected={block.exercise.techniques || []}
              onChange={v => onUpdate({ exercise: { ...block.exercise, techniques: v } })}
              placeholder="Add technique tag..."
            />
          </div>
          <input value={block.exercise?.notes || ''} onChange={e => onUpdate({ exercise: { ...block.exercise, notes: e.target.value } })}
            placeholder="Note (optional)..."
            className="w-full px-2 py-1 border border-[#ebebeb] text-xs focus:outline-none focus:border-[#111]"
          />
        </>
      )}
    </div>
  )
}

function CreativeBlockContent({ block, onUpdate }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-[#bbb] mb-1">Style tags</p>
        <TagInput
          tableName="style_tags"
          labelField="name"
          selected={block.styleTags || []}
          onChange={v => onUpdate({ styleTags: v })}
          placeholder="e.g. Metal, Improvisation, Riff writing..."
        />
      </div>
      <textarea value={block.notes || ''} onChange={e => onUpdate({ notes: e.target.value })}
        placeholder="What did you work on? Ideas that came up..."
        rows={3}
        className="w-full px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111] resize-none"
      />
    </div>
  )
}

function TheoryBlockContent({ block, onUpdate }) {
  return (
    <div className="space-y-3">
      <input value={block.theoryTopic || ''} onChange={e => onUpdate({ theoryTopic: e.target.value })}
        placeholder="Topic (e.g. Phrygian dominant, Sweep arpeggios...)"
        className="w-full px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
      />
      <div>
        <p className="text-xs text-[#bbb] mb-1">Technique tags</p>
        <TagInput
          tableName="guitar_techniques"
          labelField="name"
          selected={block.techniqueTags || []}
          onChange={v => onUpdate({ techniqueTags: v })}
          placeholder="e.g. Sweep picking, Legato..."
        />
      </div>
      <textarea value={block.theorySummary || ''} onChange={e => onUpdate({ theorySummary: e.target.value })}
        placeholder="Summary — what you learned, what clicked, what to revisit..."
        rows={4}
        className="w-full px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111] resize-none"
      />
    </div>
  )
}

function EndSessionModal({ onConfirm, onCancel, blockCount, totalMinutes }) {
  const [rating, setRating] = useState(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    await onConfirm(rating, notes)
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-5 space-y-4">
        <h3 className="text-sm font-medium text-[#111]">End session</h3>
        <div className="bg-[#f9f9f9] p-3 flex gap-4 text-sm">
          <div>
            <p className="text-xs text-[#bbb]">Duration</p>
            <p className="font-medium text-[#111]">{formatDuration(totalMinutes) || '< 1 min'}</p>
          </div>
          <div>
            <p className="text-xs text-[#bbb]">Blocks</p>
            <p className="font-medium text-[#111]">{blockCount}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-[#bbb] mb-2">How was the session?</p>
          <StarRating value={rating} onChange={setRating} />
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="One line review (optional)..."
          rows={2}
          className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111] resize-none"
        />
        <div className="flex gap-2">
          <button onClick={confirm} disabled={saving}
            className="flex-1 py-2.5 bg-[#111] text-white text-sm hover:bg-[#333] disabled:opacity-50">
            {saving ? 'Saving...' : 'Save session'}
          </button>
          <button onClick={onCancel} className="px-4 py-2.5 border border-[#ebebeb] text-sm text-[#666] hover:border-[#111]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}