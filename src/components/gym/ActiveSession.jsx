import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STRENGTH_CATS = ['weights', 'calisthenics']
const CARDIO_CATS = ['treadmill', 'distance', 'timeonly']
const CARDIO_LABELS = { treadmill: 'Treadmill', distance: 'Distance', timeonly: 'Time Only' }

function makeSet() {
  return { id: `set-${Date.now()}-${Math.random()}`, reps: '', weight: '' }
}

function makeExercise(name = '', category = 'weights') {
  const isCardio = CARDIO_CATS.includes(category)
  return {
    id: `ex-${Date.now()}-${Math.random()}`,
    name,
    category,
    sets: !isCardio ? [makeSet()] : [],
    cardio: isCardio ? {
      duration: '',
      speed: '',
      incline: category === 'treadmill' ? '0' : '',
      distance: ''
    } : null
  }
}

export default function ActiveSession({ preset, onFinish, onCancel }) {
  const [sessionName, setSessionName] = useState(
    preset?.cardioOnly ? 'Cardio session' : (preset?.name || 'Freeform session')
  )
  const [exercises, setExercises] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [showPicker, setShowPicker] = useState(!!preset?.cardioOnly)

  useEffect(() => {
    if (preset?.preset_exercises?.length > 0) {
      setExercises(preset.preset_exercises
        .sort((a, b) => a.order_index - b.order_index)
        .map(ex => {
          const base = makeExercise(ex.name, ex.category)
          if (STRENGTH_CATS.includes(ex.category) && ex.default_sets > 1) {
            base.sets = Array.from({ length: ex.default_sets }, makeSet)
          }
          if (CARDIO_CATS.includes(ex.category) && ex.target_value) {
            if (ex.target_type === 'distance') {
              base.cardio.distance = String(ex.target_value)
            } else {
              base.cardio.duration = String(ex.target_value)
            }
          }
          return base
        }))
    }
  }, [])

  function addExercise(name, category) {
    setExercises(prev => [...prev, makeExercise(name, category)])
    setShowPicker(false)
  }

  function updateName(id, name) {
    setExercises(prev => prev.map(ex => ex.id === id ? { ...ex, name } : ex))
  }

  function removeExercise(id) {
    setExercises(prev => prev.filter(ex => ex.id !== id))
  }

  function addSet(exId) {
    setExercises(prev => prev.map(ex =>
      ex.id === exId ? { ...ex, sets: [...ex.sets, makeSet()] } : ex
    ))
  }

  function updateSet(exId, setId, field, value) {
    const num = value === '' ? '' : String(Math.max(0.01, parseFloat(value) || 0))
    setExercises(prev => prev.map(ex => ex.id === exId ? {
      ...ex,
      sets: ex.sets.map(s => s.id === setId ? { ...s, [field]: num } : s)
    } : ex))
  }

  function removeSet(exId, setId) {
    setExercises(prev => prev.map(ex =>
      ex.id === exId ? { ...ex, sets: ex.sets.filter(s => s.id !== setId) } : ex
    ))
  }

  function updateCardio(exId, field, value) {
    const num = value === '' ? '' : String(Math.max(0, parseFloat(value) || 0)) // incline can be 0
    setExercises(prev => prev.map(ex =>
      ex.id === exId ? { ...ex, cardio: { ...ex.cardio, [field]: num } } : ex
    ))
  }

  function validateSession() {
    for (const ex of exercises) {
      if (!ex.name.trim()) return 'All exercises need a name.'
      if (STRENGTH_CATS.includes(ex.category)) {
        const filledSets = ex.category === 'weights'
          ? ex.sets.filter(s => s.reps && s.weight)
          : ex.sets.filter(s => s.reps)
        if (filledSets.length === 0) return `${ex.name}: log at least one set.`
        if (ex.category === 'weights') {
          for (const s of ex.sets) {
            if (s.reps || s.weight) {
              if (!s.reps || parseFloat(s.reps) < 1) return `${ex.name}: reps must be at least 1.`
              if (!s.weight || parseFloat(s.weight) < 0.01) return `${ex.name}: weight must be greater than 0.`
            }
          }
        }
        if (ex.category === 'calisthenics') {
          for (const s of ex.sets) {
            if (s.reps && parseFloat(s.reps) < 1) return `${ex.name}: reps must be at least 1.`
          }
        }
      }
      if (ex.category === 'treadmill') {
        if (!ex.cardio.duration) return `${ex.name}: duration required.`
        if (!ex.cardio.speed && !ex.cardio.distance) return `${ex.name}: speed or distance required.`
      }
      if (ex.category === 'distance') {
        if (!ex.cardio.duration) return `${ex.name}: duration required.`
        if (!ex.cardio.distance) return `${ex.name}: distance required.`
      }
      if (ex.category === 'timeonly') {
        if (!ex.cardio.duration) return `${ex.name}: duration required.`
      }
    }
    return null
  }

  async function finishSession() {
    const err = validateSession()
    if (err) { setSaveError(err); return }
    setSaveError(null)
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: session, error: sessionErr } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: user.id,
        preset_id: preset?.id || null,
        name: sessionName,
        date: new Date().toISOString().split('T')[0]
      })
      .select().single()

    if (sessionErr) { setSaveError('Failed to save session.'); setSaving(false); return }

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i]
      if (!ex.name.trim()) continue

      const { data: sessionEx, error: exErr } = await supabase
        .from('session_exercises')
        .insert({ session_id: session.id, name: ex.name, category: ex.category, order_index: i })
        .select().single()

      if (exErr) { console.error(exErr); continue }

      if (STRENGTH_CATS.includes(ex.category)) {
        const validSets = ex.category === 'weights'
          ? ex.sets.filter(s => s.reps && s.weight)
          : ex.sets.filter(s => s.reps)
        if (validSets.length > 0) {
          await supabase.from('exercise_sets').insert(
            validSets.map((s, idx) => ({
              session_exercise_id: sessionEx.id,
              set_number: idx + 1,
              reps: parseInt(s.reps),
              weight_kg: ex.category === 'weights' ? parseFloat(s.weight) : null,
              completed: true
            }))
          )
        }
      }

      if (CARDIO_CATS.includes(ex.category)) {
        await supabase.from('cardio_entries').insert({
          session_exercise_id: sessionEx.id,
          duration_minutes: ex.cardio.duration ? parseFloat(ex.cardio.duration) : null,
          distance_km: ex.cardio.distance ? parseFloat(ex.cardio.distance) : null,
          speed: ex.cardio.speed ? parseFloat(ex.cardio.speed) : null,
          incline: ex.cardio.incline !== '' ? parseFloat(ex.cardio.incline) : null,
        })
      }

      await supabase.from('exercise_library').upsert(
        { user_id: user.id, name: ex.name, category: ex.category },
        { onConflict: 'user_id,name', ignoreDuplicates: true }
      )
    }

    setSaving(false)
    onFinish()
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <input
          value={sessionName}
          onChange={e => setSessionName(e.target.value)}
          className="text-base font-semibold text-[#111] bg-transparent border-none outline-none focus:underline flex-1"
        />
      </div>

      {exercises.map(ex => (
        <ExerciseBlock
          key={ex.id}
          ex={ex}
          onUpdateName={n => updateName(ex.id, n)}
          onRemove={() => removeExercise(ex.id)}
          onAddSet={() => addSet(ex.id)}
          onUpdateSet={(sid, field, val) => updateSet(ex.id, sid, field, val)}
          onRemoveSet={sid => removeSet(ex.id, sid)}
          onUpdateCardio={(field, val) => updateCardio(ex.id, field, val)}
        />
      ))}

      {showPicker ? (
        <ExercisePicker
          cardioOnly={!!preset?.cardioOnly}
          onSelect={addExercise}
          onClose={() => setShowPicker(false)}
        />
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="w-full py-3 border border-dashed border-[#ddd] text-sm text-[#999] hover:border-[#111] hover:text-[#111] transition-colors"
        >
          + Add exercise
        </button>
      )}

      {saveError && <p className="text-xs text-red-500 mt-2">{saveError}</p>}

      <div className="flex gap-3 pt-2 pb-8">
        <button onClick={finishSession} disabled={saving}
          className="flex-1 py-3 bg-[#111] text-white text-sm font-medium hover:bg-[#333] transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Finish session'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-3 border border-[#ebebeb] text-sm text-[#666] hover:border-[#111] transition-colors">
          Discard
        </button>
      </div>
    </div>
  )
}

function ExerciseBlock({ ex, onUpdateName, onRemove, onAddSet, onUpdateSet, onRemoveSet, onUpdateCardio }) {
  const isCardio = CARDIO_CATS.includes(ex.category)
  const isCalisthenics = ex.category === 'calisthenics'

  return (
    <div className="bg-white border border-[#ebebeb]">
      <div className="flex items-center gap-2 p-3 border-b border-[#ebebeb]">
        <input
          value={ex.name}
          onChange={e => onUpdateName(e.target.value)}
          placeholder="Exercise name"
          className="flex-1 text-sm font-medium text-[#111] bg-transparent outline-none"
        />
        <span className="text-xs text-[#bbb] shrink-0 capitalize">
          {isCardio ? CARDIO_LABELS[ex.category] : ex.category}
        </span>
        <button onClick={onRemove} className="text-[#ccc] hover:text-red-400 transition-colors ml-1">✕</button>
      </div>

      {!isCardio && (
        <div className="p-3 space-y-2">
          {/* Always 3-col grid, weight col shows — for calisthenics */}
          <div className="grid grid-cols-[32px_1fr_1fr_24px] gap-2 px-1 mb-1">
            <span className="text-xs text-[#bbb] text-center">#</span>
            <span className="text-xs text-[#bbb] text-center">{isCalisthenics ? '' : 'kg'}</span>
            <span className="text-xs text-[#bbb] text-center">Reps</span>
            <span />
          </div>
          {ex.sets.map((set, idx) => (
            <SetRow
              key={set.id}
              set={set}
              idx={idx}
              isCalisthenics={isCalisthenics}
              onUpdate={(field, val) => onUpdateSet(set.id, field, val)}
              onRemove={() => onRemoveSet(set.id)}
            />
          ))}
          <button onClick={onAddSet} className="text-xs text-[#999] hover:text-[#111] transition-colors">
            + Add set
          </button>
        </div>
      )}

      {isCardio && <CardioFields ex={ex} onUpdate={onUpdateCardio} />}
    </div>
  )
}

function SetRow({ set, idx, isCalisthenics, onUpdate, onRemove }) {
  return (
    <div className="grid grid-cols-[32px_1fr_1fr_24px] gap-2 items-center">
      <span className="text-xs text-[#bbb] text-center">{idx + 1}</span>
      {isCalisthenics ? (
        <span className="text-xs text-[#ddd] text-center">—</span>
      ) : (
        <NumInput value={set.weight} onChange={v => onUpdate('weight', v)} placeholder="kg" />
      )}
      <NumInput value={set.reps} onChange={v => onUpdate('reps', v)} placeholder="reps" integer />
      <button onClick={onRemove} className="text-[#ddd] hover:text-red-400 text-xs transition-colors">✕</button>
    </div>
  )
}

function CardioFields({ ex, onUpdate }) {
  const { category, cardio } = ex

  const totalMins = parseFloat(cardio.duration) || 0
  const displayHrs = Math.floor(totalMins / 60)
  const displayMins = Math.round(totalMins % 60)

  function updateDuration(hrs, mins) {
    const total = (parseInt(hrs) || 0) * 60 + (parseInt(mins) || 0)
    onUpdate('duration', total > 0 ? String(total) : '')
  }

  // Speed and distance are mutually exclusive for treadmill
  function updateSpeed(v) {
    onUpdate('speed', v)
    if (v) onUpdate('distance', '')
  }
  function updateDistance(v) {
    onUpdate('distance', v)
    if (v) onUpdate('speed', '')
  }

  return (
    <div className="p-3 space-y-2">
      {/* Duration always first */}
      <div>
        <label className="text-xs text-[#bbb] block mb-1">Duration *</label>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <NumInput value={displayHrs || ''} onChange={v => updateDuration(v, displayMins)} placeholder="0" integer small />
            <span className="text-xs text-[#bbb]">hrs</span>
          </div>
          <div className="flex items-center gap-1">
            <NumInput value={displayMins || ''} onChange={v => updateDuration(displayHrs, Math.min(59, parseInt(v) || 0))} placeholder="0" integer small />
            <span className="text-xs text-[#bbb]">min</span>
          </div>
        </div>
      </div>

      {category === 'treadmill' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-[#bbb] block mb-1">Speed (km/h) <span className="text-[#ccc]">(or distance)</span></label>
            <NumInput value={cardio.speed} onChange={updateSpeed} placeholder="optional" allowDecimal />
          </div>
          <div>
            <label className="text-xs text-[#bbb] block mb-1">Distance (km) <span className="text-[#ccc]">(or speed)</span></label>
            <NumInput value={cardio.distance} onChange={updateDistance} placeholder="optional" allowDecimal />
          </div>
          <div>
            <label className="text-xs text-[#bbb] block mb-1">Incline (%)</label>
            <NumInput value={cardio.incline} onChange={v => onUpdate('incline', v)} placeholder="0" allowDecimal />
          </div>
        </div>
      )}

      {category === 'distance' && (
        <div>
          <label className="text-xs text-[#bbb] block mb-1">Distance (km) *</label>
          <NumInput value={cardio.distance} onChange={v => onUpdate('distance', v)} placeholder="required" allowDecimal />
        </div>
      )}
    </div>
  )
}

function NumInput({ value, onChange, placeholder, allowDecimal, integer, small }) {
  return (
    <input
      type="number"
      min="0"
      step={allowDecimal ? '0.1' : '1'}
      value={value}
      onChange={e => {
        const v = e.target.value
        if (v === '') { onChange(''); return }
        const n = allowDecimal ? parseFloat(v) : parseInt(v)
        if (!isNaN(n) && n >= 0) onChange(String(integer ? Math.floor(n) : n))
      }}
      placeholder={placeholder}
      className={`border border-[#ebebeb] text-sm text-center focus:outline-none focus:border-[#111] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${small ? 'w-14 px-1 py-1.5' : 'w-full px-2 py-1.5'}`}
    />
  )
}

function ExercisePicker({ cardioOnly, onSelect, onClose }) {
  const [isStrength, setIsStrength] = useState(!cardioOnly)
  const [subTab, setSubTab] = useState(cardioOnly ? 'treadmill' : 'weights')
  const [search, setSearch] = useState('')
  const [library, setLibrary] = useState([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase.from('exercise_library').select('*').eq('user_id', user.id).order('name')
      setLibrary(data || [])
    }
    load()
  }, [])

  const strengthTabs = [{ id: 'weights', label: 'Weights' }, { id: 'calisthenics', label: 'Calisthenics' }]
  const cardioTabs = [{ id: 'treadmill', label: 'Treadmill' }, { id: 'distance', label: 'Distance' }, { id: 'timeonly', label: 'Time Only' }]

  const defaults = {
    weights: ['Bench Press','Incline Bench Press','Overhead Press','Squat','Romanian Deadlift','Deadlift','Leg Press','Barbell Row','Cable Row','Lateral Raise','Bicep Curl','Tricep Pushdown','Chest Fly','Face Pull'],
    calisthenics: ['Pull Up','Dips','Push Up','Chin Up','Hanging Leg Raise','Pike Push Up','Muscle Up'],
    treadmill: ['Treadmill Run','Incline Walk'],
    distance: ['Outdoor Run','Outdoor Walk','Cycling','Rowing'],
    timeonly: ['Stairmaster','Elliptical','HIIT','Jump Rope']
  }

  const libraryNames = library.filter(e => e.category === subTab).map(e => e.name)
  const allNames = [...new Set([...libraryNames, ...(defaults[subTab] || [])])]
  const filtered = allNames.filter(n => n.toLowerCase().includes(search.toLowerCase()))
  const exactMatch = filtered.find(n => n.toLowerCase() === search.toLowerCase())

  function switchTop(toStrength) {
    setIsStrength(toStrength)
    setSubTab(toStrength ? 'weights' : 'treadmill')
    setSearch('')
  }

  return (
    <div className="bg-white border border-[#111] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#111]">Add exercise</span>
        <button onClick={onClose} className="text-xs text-[#999] hover:text-[#111]">Cancel</button>
      </div>

      {!cardioOnly && (
        <div className="flex gap-1">
          {['Strength', 'Cardio'].map((label, i) => {
            const isStr = i === 0
            return (
              <button key={label} onClick={() => switchTop(isStr)}
                className={`px-3 py-1 text-xs transition-colors ${isStrength === isStr ? 'bg-[#111] text-white' : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex gap-1 flex-wrap">
        {(isStrength ? strengthTabs : cardioTabs).map(t => (
          <button key={t.id} onClick={() => { setSubTab(t.id); setSearch('') }}
            className={`px-3 py-1 text-xs transition-colors ${subTab === t.id ? 'bg-[#444] text-white' : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or type a name..." autoFocus
        className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
      />

      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {search && !exactMatch && (
          <button onClick={() => onSelect(search, subTab)} className="w-full text-left px-3 py-2 text-sm text-[#4F46E5] hover:bg-[#f7f7f7]">
            + Add "{search}"
          </button>
        )}
        {filtered.map(n => (
          <button key={n} onClick={() => onSelect(n, subTab)} className="w-full text-left px-3 py-2 text-sm text-[#111] hover:bg-[#f7f7f7]">
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}