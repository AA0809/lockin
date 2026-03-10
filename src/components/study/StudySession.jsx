import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const STORAGE_KEY = 'lockin_study_session'

function pad(n) { return String(n).padStart(2, '0') }

function fmtCountdown(s) {
  const abs = Math.abs(s)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const sec = abs % 60
  const sign = s < 0 ? '+' : ''
  if (h > 0) return `${sign}${h}:${pad(m)}:${pad(sec)}`
  return `${sign}${pad(m)}:${pad(sec)}`
}

function fmtUp(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`
  return `${pad(m)}:${pad(sec)}`
}

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export default function StudySession() {
  const [phase, setPhase] = useState('config')
  const [config, setConfig] = useState({
    mode: 'countdown',
    pomodoro: false,
    hours: '0',
    minutes: '25',
    breakMins: '5',
    workMins: '25',
    goal: '',
  })

  const sessionStartRef = useRef(null)
  const pauseStartRef = useRef(null)
  const totalPausedRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [display, setDisplay] = useState('00:00')
  const [overtime, setOvertime] = useState(false)
  const [isBreakPhase, setIsBreakPhase] = useState(false)
  const [pomodoroCount, setPomodoroCount] = useState(0)
  const intervalRef = useRef(null)
  const prevIsBreakRef = useRef(false)

  const [sessionId, setSessionId] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [activeBlock, setActiveBlock] = useState(null)
  const [showBlockPicker, setShowBlockPicker] = useState(false)
  const [subjects, setSubjects] = useState([])

  const [showEnd, setShowEnd] = useState(false)
  const [rating, setRating] = useState(null)
  const [goalAchieved, setGoalAchieved] = useState(null)
  const [endNotes, setEndNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSubjects()
    restoreSession()
  }, [])

  async function loadSubjects() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('study_subjects').select('*').eq('user_id', user.id).order('name')
    setSubjects(data || [])
  }

  function restoreSession() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return
      const state = JSON.parse(saved)
      if (!state.sessionStartMs) return
      sessionStartRef.current = state.sessionStartMs
      totalPausedRef.current = state.totalPausedMs || 0
      setSessionId(state.sessionId)
      setConfig(state.config)
      setBlocks(state.blocks || [])
      setPomodoroCount(state.pomodoroCount || 0)
      if (state.pausedAt) {
        pauseStartRef.current = Date.now()
        setPaused(true)
      }
      setPhase('active')
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId,
        sessionStartMs: sessionStartRef.current,
        totalPausedMs: totalPausedRef.current,
        pausedAt: pauseStartRef.current ? Date.now() : null,
        config,
        blocks,
        pomodoroCount,
      }))
    } catch (e) {}
  }

  function getElapsedSecs() {
    if (!sessionStartRef.current) return 0
    const pausedNow = pauseStartRef.current ? Date.now() - pauseStartRef.current : 0
    return Math.floor((Date.now() - sessionStartRef.current - totalPausedRef.current - pausedNow) / 1000)
  }

  useEffect(() => {
    if (phase !== 'active') return
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      if (pauseStartRef.current) return
      const elapsed = getElapsedSecs()
      const hrs = parseInt(config.hours) || 0
      const mins = parseInt(config.minutes) || 0
      const workMins = parseInt(config.workMins) || 25
      const breakMins = parseInt(config.breakMins) || 5

      if (config.pomodoro) {
        const workSecs = workMins * 60
        const breakSecs = breakMins * 60
        const cycleLen = workSecs + breakSecs
        const posInCycle = elapsed % cycleLen
        const inBreak = posInCycle >= workSecs

        if (inBreak) {
          const rem = breakSecs - (posInCycle - workSecs)
          setDisplay(fmtCountdown(rem))
          setIsBreakPhase(true)
          if (!prevIsBreakRef.current) {
            setPomodoroCount(c => c + 1)
          }
          prevIsBreakRef.current = true
        } else {
          if (config.mode === 'countdown') {
            const target = hrs * 3600 + mins * 60
            const remaining = target - elapsed
            setDisplay(fmtCountdown(remaining))
            setOvertime(remaining < 0)
          } else {
            setDisplay(fmtUp(elapsed))
          }
          setIsBreakPhase(false)
          prevIsBreakRef.current = false
        }
      } else if (config.mode === 'countdown') {
        const target = hrs * 3600 + mins * 60
        const remaining = target - elapsed
        setDisplay(fmtCountdown(remaining))
        setOvertime(remaining < 0)
        setIsBreakPhase(false)
      } else {
        setDisplay(fmtUp(elapsed))
        setIsBreakPhase(false)
      }

      saveToStorage()
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [phase, paused, config, blocks, pomodoroCount])

  async function startSession() {
    const now = Date.now()
    sessionStartRef.current = now
    totalPausedRef.current = 0
    pauseStartRef.current = null
    const hrs = parseInt(config.hours) || 0
    const mins = parseInt(config.minutes) || 0
    const planned = config.mode === 'countdown' ? hrs * 60 + mins : null
    const { data: { user } } = await supabase.auth.getUser()
    const { data: session } = await supabase.from('study_sessions').insert({
      user_id: user.id,
      date: new Date().toISOString().split('T')[0],
      started_at: new Date().toISOString(),
      planned_minutes: planned,
      timer_mode: config.pomodoro ? 'pomodoro' : config.mode,
      goal: config.goal || null,
    }).select().single()
    setSessionId(session?.id)
    setDisplay(config.mode === 'countdown' ? fmtCountdown((parseInt(config.hours)||0)*3600 + (parseInt(config.minutes)||0)*60) : '00:00')
    setPhase('active')
  }

  function handlePause() {
    if (!pauseStartRef.current) {
      pauseStartRef.current = Date.now()
      setPaused(true)
    } else {
      totalPausedRef.current += Date.now() - pauseStartRef.current
      pauseStartRef.current = null
      setPaused(false)
    }
  }

  function handleEndBlock() {
    if (!activeBlock) return
    const now = Date.now()
    const durMins = Math.max(1, Math.round((now - activeBlock.startedAt) / 60000))
    setBlocks(prev => [...prev, { ...activeBlock, endedAt: now, duration: durMins }])
    setActiveBlock(null)
  }

  function startBlock(subject) {
    if (activeBlock) handleEndBlock()
    setActiveBlock({
      id: `b-${Date.now()}`,
      subject,
      subjectName: subject?.name || 'General',
      startedAt: Date.now(),
      notes: '',
    })
    setShowBlockPicker(false)
  }

  async function finishSession() {
    setSaving(true)
    if (activeBlock) handleEndBlock()
    clearInterval(intervalRef.current)
    localStorage.removeItem(STORAGE_KEY)
    const totalMins = Math.max(1, Math.round(getElapsedSecs() / 60))
    await supabase.from('study_sessions').update({
      ended_at: new Date().toISOString(),
      total_minutes: totalMins,
      rating,
      goal_achieved: goalAchieved,
      notes: endNotes || null,
    }).eq('id', sessionId)

    const finalBlocks = activeBlock
      ? [...blocks, { ...activeBlock, endedAt: Date.now(), duration: Math.max(1, Math.round((Date.now() - activeBlock.startedAt) / 60000)) }]
      : blocks

    if (finalBlocks.length > 0) {
      await supabase.from('study_blocks').insert(
        finalBlocks.map((b, i) => ({
          session_id: sessionId,
          subject_id: b.subject?.id || null,
          subject_name: b.subjectName,
          started_at: new Date(b.startedAt).toISOString(),
          ended_at: new Date(b.endedAt).toISOString(),
          duration_minutes: b.duration,
          notes: b.notes || null,
          order_index: i,
        }))
      )
    }

    setPhase('config')
    setSessionId(null)
    setBlocks([])
    setActiveBlock(null)
    setPomodoroCount(0)
    setPaused(false)
    setRating(null)
    setGoalAchieved(null)
    setEndNotes('')
    setShowEnd(false)
    setSaving(false)
    sessionStartRef.current = null
    totalPausedRef.current = 0
    pauseStartRef.current = null
  }

  if (phase === 'config') {
    return <ConfigScreen config={config} setConfig={setConfig} onStart={startSession} />
  }

  return (
    <div className="max-w-lg space-y-5">
      {/* Timer */}
      <div className={`p-8 text-center ${isBreakPhase ? 'bg-[#f0fdf4]' : overtime ? 'bg-[#fff7ed]' : 'bg-[#f9f9f9]'}`}>
        <p className="text-xs text-[#999] mb-2 uppercase tracking-wider">
          {isBreakPhase ? 'Break' : config.mode === 'freeform' ? 'Elapsed' : overtime ? 'Over by' : 'Remaining'}
        </p>
        <p className={`font-mono font-semibold tracking-tight ${display.length > 5 ? 'text-5xl' : 'text-6xl'} ${overtime ? 'text-[#d97706]' : isBreakPhase ? 'text-[#16a34a]' : 'text-[#111]'}`}>
          {display}
        </p>
        {config.pomodoro && (
          <p className="text-xs text-[#999] mt-2">
            {isBreakPhase ? `Break after round ${pomodoroCount}` : `Round ${pomodoroCount + 1}`} · {config.workMins}m / {config.breakMins}m
          </p>
        )}
        {paused && <p className="text-xs text-[#bbb] mt-2">Paused</p>}
      </div>

      <div className="flex gap-2">
        <button onClick={handlePause}
          className="flex-1 py-2.5 border border-[#ebebeb] text-sm text-[#666] hover:border-[#111] transition-colors">
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={() => setShowEnd(true)}
          className="flex-1 py-2.5 bg-[#111] text-white text-sm hover:bg-[#333] transition-colors">
          End session
        </button>
      </div>

      {config.goal && (
        <div className="p-3 bg-[#f9f9f9] text-sm flex gap-2">
          <span className="text-[#bbb]">Goal:</span>
          <span className="text-[#666]">{config.goal}</span>
        </div>
      )}

      {activeBlock && !isBreakPhase && (
        <div className="border border-[#111] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#bbb]">Studying</p>
              <p className="text-sm font-medium text-[#111]">{activeBlock.subjectName}</p>
            </div>
            <button onClick={handleEndBlock} className="text-xs px-2 py-1 bg-[#111] text-white hover:bg-[#333]">Done</button>
          </div>
          <input value={activeBlock.notes || ''} onChange={e => setActiveBlock(b => ({ ...b, notes: e.target.value }))}
            placeholder="Note (optional)..."
            className="w-full px-2 py-1 border border-[#ebebeb] text-xs focus:outline-none focus:border-[#111]"
          />
        </div>
      )}

      {blocks.length > 0 && (
        <div className="space-y-1">
          {blocks.map(b => (
            <div key={b.id} className="flex items-center justify-between p-2 bg-[#f9f9f9] text-xs">
              <span className="text-[#111] font-medium">{b.subjectName}</span>
              <span className="text-[#bbb]">{b.duration}m</span>
            </div>
          ))}
        </div>
      )}

      {!isBreakPhase && !showBlockPicker && (
        <button onClick={() => setShowBlockPicker(true)}
          className="w-full py-3 border border-dashed border-[#ddd] text-sm text-[#999] hover:border-[#111] hover:text-[#111] transition-colors">
          {activeBlock ? '+ Switch subject' : '+ Log subject'}
        </button>
      )}

      {showBlockPicker && !isBreakPhase && (
        <SubjectPicker subjects={subjects} onSelect={startBlock}
          onClose={() => setShowBlockPicker(false)}
          onSubjectCreated={s => { setSubjects(prev => [...prev, s].sort((a,b) => a.name.localeCompare(b.name))); startBlock(s) }}
        />
      )}

      {showEnd && (
        <EndModal
          totalMins={Math.max(1, Math.round(getElapsedSecs() / 60))}
          goal={config.goal}
          rating={rating} setRating={setRating}
          goalAchieved={goalAchieved} setGoalAchieved={setGoalAchieved}
          endNotes={endNotes} setEndNotes={setEndNotes}
          onConfirm={finishSession} onCancel={() => setShowEnd(false)}
          saving={saving}
        />
      )}
    </div>
  )
}

// ---- Number input that allows empty string ----
function NumInput({ value, onChange, min = 0, max, className = '' }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={e => onChange(e.target.value)}
      onBlur={e => {
        const n = parseInt(e.target.value)
        if (isNaN(n) || n < min) onChange(String(min))
        else if (max !== undefined && n > max) onChange(String(max))
        else onChange(String(n))
      }}
      className={`border border-[#ebebeb] text-sm text-center focus:outline-none focus:border-[#111] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
    />
  )
}

function ConfigScreen({ config, setConfig, onStart }) {
  function set(key, val) { setConfig(c => ({ ...c, [key]: val })) }

  const canStart = config.mode === 'freeform'
    || ((parseInt(config.hours) || 0) > 0 || (parseInt(config.minutes) || 0) > 0)

  return (
    <div className="max-w-lg space-y-5">
      <h2 className="text-xs font-medium text-[#999] uppercase tracking-wider">New session</h2>

      {/* Mode */}
      <div>
        <p className="text-xs text-[#bbb] mb-2">Timer mode</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'countdown', label: 'Countdown', desc: 'Set a target duration' },
            { id: 'freeform', label: 'Free study', desc: 'Count up, no pressure' },
          ].map(m => (
            <button key={m.id} onClick={() => set('mode', m.id)}
              className={`p-3 border text-left transition-colors ${config.mode === m.id ? 'border-[#111] bg-[#111]' : 'border-[#ebebeb] hover:border-[#111]'}`}>
              <p className={`text-sm font-medium ${config.mode === m.id ? 'text-white' : 'text-[#111]'}`}>{m.label}</p>
              <p className={`text-xs mt-0.5 ${config.mode === m.id ? 'text-[#777]' : 'text-[#bbb]'}`}>{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Duration — countdown only */}
      {config.mode === 'countdown' && (
        <div>
          <p className="text-xs text-[#bbb] mb-2">Duration</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <NumInput value={config.hours} onChange={v => set('hours', v)} min={0} max={12} className="w-14 px-2 py-1.5" />
              <span className="text-xs text-[#bbb]">hrs</span>
            </div>
            <div className="flex items-center gap-1">
              <NumInput value={config.minutes} onChange={v => set('minutes', v)} min={0} max={59} className="w-14 px-2 py-1.5" />
              <span className="text-xs text-[#bbb]">min</span>
            </div>
          </div>
          <div className="flex gap-1 mt-2 flex-wrap">
            {[[0,'25'],[0,'45'],[1,'0'],[1,'30'],[2,'0']].map(([h,m]) => (
              <button key={`${h}${m}`} onClick={() => { set('hours', String(h)); set('minutes', m) }}
                className={`px-2 py-0.5 text-xs border transition-colors ${config.hours === String(h) && config.minutes === m ? 'bg-[#111] text-white border-[#111]' : 'border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                {h > 0 ? `${h}h${m !== '0' ? ` ${m}m` : ''}` : `${m}m`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pomodoro toggle — works with both modes */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div onClick={() => set('pomodoro', !config.pomodoro)}
            className={`w-10 h-5 rounded-full transition-colors relative ${config.pomodoro ? 'bg-[#111]' : 'bg-[#e0e0e0]'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${config.pomodoro ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-[#111]">Pomodoro breaks</span>
        </label>

        {config.pomodoro && (
          <div className="mt-3 pl-13 space-y-3 border-l-2 border-[#ebebeb] ml-1 pl-4">
            <div>
              <p className="text-xs text-[#bbb] mb-1.5">Work interval</p>
              <div className="flex items-center gap-2">
                <NumInput value={config.workMins} onChange={v => set('workMins', v)} min={1} max={120} className="w-16 px-2 py-1.5" />
                <span className="text-xs text-[#bbb]">min</span>
              </div>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {['15','20','25','30','45','50'].map(m => (
                  <button key={m} onClick={() => set('workMins', m)}
                    className={`px-2 py-0.5 text-xs border transition-colors ${config.workMins === m ? 'bg-[#111] text-white border-[#111]' : 'border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                    {m}m
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-[#bbb] mb-1.5">Break length</p>
              <div className="flex items-center gap-2">
                <NumInput value={config.breakMins} onChange={v => set('breakMins', v)} min={1} max={30} className="w-16 px-2 py-1.5" />
                <span className="text-xs text-[#bbb]">min</span>
              </div>
              <div className="flex gap-1 mt-1.5">
                {['5','10','15'].map(m => (
                  <button key={m} onClick={() => set('breakMins', m)}
                    className={`px-2 py-0.5 text-xs border transition-colors ${config.breakMins === m ? 'bg-[#111] text-white border-[#111]' : 'border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                    {m}m
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Goal */}
      <div>
        <p className="text-xs text-[#bbb] mb-1.5">Session goal <span className="text-[#ccc]">(optional)</span></p>
        <input value={config.goal} onChange={e => set('goal', e.target.value)}
          placeholder="e.g. Finish chapter 4, complete problem set..."
          className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
        />
      </div>

      <button onClick={onStart} disabled={!canStart}
        className="w-full py-3 bg-[#111] text-white text-sm hover:bg-[#333] transition-colors disabled:opacity-40">
        Start session
      </button>
    </div>
  )
}

function SubjectPicker({ subjects, onSelect, onClose, onSubjectCreated }) {
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function createSubject() {
    if (!newName.trim()) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('study_subjects')
      .upsert({ user_id: user.id, name: newName.trim() }, { onConflict: 'user_id,name' })
      .select().single()
    if (data) onSubjectCreated(data)
    setNewName('')
    setCreating(false)
  }

  return (
    <div className="border border-[#111] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#111]">Select subject</p>
        <button onClick={onClose} className="text-xs text-[#999] hover:text-[#111]">Cancel</button>
      </div>
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {subjects.length === 0 && <p className="text-xs text-[#bbb] px-2">No subjects yet — create one below.</p>}
        {subjects.map(s => (
          <button key={s.id} onClick={() => onSelect(s)}
            className="w-full text-left px-3 py-2 text-sm text-[#111] hover:bg-[#f7f7f7]">
            {s.name}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') createSubject() }}
          placeholder="New subject..."
          className="flex-1 px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
        />
        <button onClick={createSubject} disabled={!newName.trim() || creating}
          className="px-3 py-1.5 bg-[#111] text-white text-xs disabled:opacity-40">
          {creating ? '...' : 'Add'}
        </button>
      </div>
    </div>
  )
}

function EndModal({ totalMins, goal, rating, setRating, goalAchieved, setGoalAchieved, endNotes, setEndNotes, onConfirm, onCancel, saving }) {
  function fmt(minutes) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${m}m`
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-5 space-y-4">
        <h3 className="text-sm font-medium">End session</h3>
        <div className="bg-[#f9f9f9] p-3">
          <p className="text-xs text-[#bbb]">Total time</p>
          <p className="text-lg font-semibold text-[#111]">{fmt(totalMins)}</p>
        </div>
        {goal && (
          <div>
            <p className="text-xs text-[#bbb] mb-1.5">Goal: <span className="text-[#666]">{goal}</span></p>
            <div className="flex gap-2">
              {[{val:true,label:'Achieved'},{val:false,label:'Not achieved'}].map(({val,label}) => (
                <button key={label} onClick={() => setGoalAchieved(goalAchieved === val ? null : val)}
                  className={`px-3 py-1.5 text-xs border transition-colors ${goalAchieved === val ? 'bg-[#111] text-white border-[#111]' : 'border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs text-[#bbb] mb-2">Session rating</p>
          <div className="flex gap-1">
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setRating(rating === n ? null : n)}
                className={`text-2xl transition-colors ${n <= (rating||0) ? 'text-[#111]' : 'text-[#ddd]'}`}>★</button>
            ))}
          </div>
        </div>
        <textarea value={endNotes} onChange={e => setEndNotes(e.target.value)}
          placeholder="Notes (optional)..." rows={2}
          className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111] resize-none"
        />
        <div className="flex gap-2">
          <button onClick={onConfirm} disabled={saving}
            className="flex-1 py-2.5 bg-[#111] text-white text-sm hover:bg-[#333] disabled:opacity-50">
            {saving ? 'Saving...' : 'Save session'}
          </button>
          <button onClick={onCancel}
            className="px-4 py-2.5 border border-[#ebebeb] text-sm text-[#666] hover:border-[#111]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}