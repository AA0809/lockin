import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STRENGTH_CATS = ['weights', 'calisthenics']
const CARDIO_CATS = ['treadmill', 'distance', 'timeonly']
const CARDIO_LABELS = { treadmill: 'Treadmill', distance: 'Distance', timeonly: 'Time Only' }

export default function PresetManager({ onStartSession }) {
  const [presets, setPresets] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { fetchPresets() }, [])

  async function fetchPresets() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('workout_presets')
      .select(`*, preset_exercises(*)`)
      .eq('user_id', user.id)
      .order('created_at')
    if (error) console.error(error)
    setPresets(data || [])
    setLoading(false)
  }

  async function deletePreset(id) {
    if (!confirm('Delete this preset?')) return
    await supabase.from('workout_presets').delete().eq('id', id)
    setEditingId(null)
    fetchPresets()
  }

  if (loading) return <p className="text-sm text-[#999]">Loading...</p>

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-[#999] uppercase tracking-wider">Presets</h2>
        {!creating && !editingId && (
          <button
            onClick={() => setCreating(true)}
            className="text-xs px-3 py-1.5 bg-[#111] text-white hover:bg-[#333] transition-colors"
          >
            + New preset
          </button>
        )}
      </div>

      {!creating && !editingId && (
        <>
          <button
            onClick={() => onStartSession({ cardioOnly: true })}
            className="w-full text-left p-4 bg-white border border-[#ebebeb] hover:border-[#111] transition-colors"
          >
            <p className="text-sm font-medium text-[#111]">Start a cardio session</p>
            <p className="text-xs text-[#999] mt-0.5">Log one or more cardio exercises</p>
          </button>
          <button
            onClick={() => onStartSession(null)}
            className="w-full text-left p-4 bg-white border border-[#ebebeb] hover:border-[#111] transition-colors"
          >
            <p className="text-sm font-medium text-[#111]">Freeform session</p>
            <p className="text-xs text-[#999] mt-0.5">Start without a preset</p>
          </button>
        </>
      )}

      {creating && (
        <PresetEditor
          preset={null}
          onSave={() => { setCreating(false); fetchPresets() }}
          onCancel={() => setCreating(false)}
          onDelete={null}
        />
      )}

      {presets.length === 0 && !creating && (
        <p className="text-sm text-[#999]">No presets yet.</p>
      )}

      {presets.map(preset => {
        const isEditing = editingId === preset.id
        const isExpanded = expandedId === preset.id
        const exercises = preset.preset_exercises?.sort((a, b) => a.order_index - b.order_index) || []

        if (isEditing) {
          return (
            <PresetEditor
              key={preset.id}
              preset={preset}
              onSave={() => { setEditingId(null); fetchPresets() }}
              onCancel={() => setEditingId(null)}
              onDelete={() => deletePreset(preset.id)}
            />
          )
        }

        return (
          <div key={preset.id} className="bg-white border border-[#ebebeb]">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-[#111]">{preset.name}</p>
                <p className="text-xs text-[#999] mt-0.5">{exercises.length} exercises</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditingId(preset.id); setCreating(false) }}
                  className="text-xs text-[#999] hover:text-[#111] px-2 py-1 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => onStartSession(preset)}
                  className="text-xs px-3 py-1.5 bg-[#111] text-white hover:bg-[#333] transition-colors"
                >
                  Start
                </button>
              </div>
            </div>

            {exercises.length > 0 && (
              <>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : preset.id)}
                  className="w-full text-xs text-[#999] hover:text-[#111] transition-colors py-2 border-t border-[#ebebeb]"
                >
                  {isExpanded ? 'Hide exercises ▲' : 'Show exercises ▼'}
                </button>
                {isExpanded && (
                  <div className="px-4 py-2 space-y-1 border-t border-[#ebebeb]">
                    {exercises.map(ex => (
                      <div key={ex.id} className="flex items-center justify-between py-0.5">
                        <p className="text-xs text-[#666]">{ex.name}</p>
                        <p className="text-xs text-[#bbb]">
                          {STRENGTH_CATS.includes(ex.category)
                            ? `${ex.default_sets || 3} sets`
                            : ex.target_value
                              ? `${ex.target_value} ${ex.target_type === 'time' ? 'min' : 'km'}`
                              : CARDIO_LABELS[ex.category] || ex.category}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PresetEditor({ preset, onSave, onCancel, onDelete }) {
  const [name, setName] = useState(preset?.name || '')
  const [exercises, setExercises] = useState(
    preset?.preset_exercises
      ?.sort((a, b) => a.order_index - b.order_index)
      .map(ex => ({ ...ex, tempId: `t-${Math.random()}`, default_sets: ex.default_sets || 3 }))
    || []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showPicker, setShowPicker] = useState(false)

  function updateSets(tempId, delta) {
    setExercises(prev => prev.map(ex =>
      ex.tempId === tempId
        ? { ...ex, default_sets: Math.max(1, (ex.default_sets || 3) + delta) }
        : ex
    ))
  }

  function updateTarget(tempId, field, value) {
    setExercises(prev => prev.map(ex =>
      ex.tempId === tempId ? { ...ex, [field]: value } : ex
    ))
  }

  function removeEx(tempId) {
    setExercises(prev => prev.filter(ex => ex.tempId !== tempId))
  }

  async function save() {
    if (!name.trim()) { setError('Please enter a preset name.'); return }
    setError(null)
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    try {
      let presetId = preset?.id
      if (!presetId) {
        const { data, error: insertErr } = await supabase
          .from('workout_presets')
          .insert({ name: name.trim(), user_id: user.id })
          .select().single()
        if (insertErr) throw insertErr
        presetId = data.id
      } else {
        const { error: updateErr } = await supabase
          .from('workout_presets')
          .update({ name: name.trim() })
          .eq('id', presetId)
        if (updateErr) throw updateErr
        const { error: deleteErr } = await supabase
          .from('preset_exercises')
          .delete()
          .eq('preset_id', presetId)
        if (deleteErr) throw deleteErr
      }

      if (exercises.length > 0) {
        const { error: exErr } = await supabase
          .from('preset_exercises')
          .insert(exercises.map((ex, i) => ({
            preset_id: presetId,
            name: ex.name,
            category: ex.category,
            default_sets: STRENGTH_CATS.includes(ex.category) ? (ex.default_sets || 3) : null,
            target_type: CARDIO_CATS.includes(ex.category) ? (ex.target_type || 'time') : null,
            target_value: CARDIO_CATS.includes(ex.category) && ex.target_value
              ? parseFloat(ex.target_value) : null,
            order_index: i
          })))
        if (exErr) throw exErr
      }
      onSave()
    } catch (err) {
      console.error(err)
      setError('Failed to save: ' + (err.message || 'unknown error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-[#111] p-4 space-y-4">
      <h3 className="text-sm font-medium text-[#111]">{preset ? 'Edit preset' : 'New preset'}</h3>

      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Preset name (e.g. Push A)"
        className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
      />

      <div className="space-y-3">
        {exercises.map(ex => (
          <div key={ex.tempId} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm text-[#111] truncate">{ex.name}</p>
              <span className="text-xs text-[#bbb] shrink-0 capitalize">
                {STRENGTH_CATS.includes(ex.category) ? ex.category : CARDIO_LABELS[ex.category]}
              </span>
              <button onClick={() => removeEx(ex.tempId)} className="text-[#ccc] hover:text-red-400 transition-colors shrink-0">✕</button>
            </div>

            {STRENGTH_CATS.includes(ex.category) && (
              <div className="flex items-center gap-1 pl-1">
                <button onClick={() => updateSets(ex.tempId, -1)} className="w-6 h-6 border border-[#ebebeb] text-sm hover:border-[#111] transition-colors flex items-center justify-center">−</button>
                <span className="text-sm w-5 text-center">{ex.default_sets || 3}</span>
                <button onClick={() => updateSets(ex.tempId, 1)} className="w-6 h-6 border border-[#ebebeb] text-sm hover:border-[#111] transition-colors flex items-center justify-center">+</button>
                <span className="text-xs text-[#999] ml-1">sets</span>
              </div>
            )}

            {CARDIO_CATS.includes(ex.category) && (
              <div className="flex items-center gap-2 pl-1 flex-wrap">
                {ex.category !== 'timeonly' && (
                  <div className="flex gap-1">
                    {['time', 'distance'].map(t => (
                      <button
                        key={t}
                        onClick={() => updateTarget(ex.tempId, 'target_type', t)}
                        className={`px-2 py-0.5 text-xs transition-colors ${
                          (ex.target_type || 'time') === t
                            ? 'bg-[#111] text-white'
                            : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'
                        }`}
                      >
                        {t === 'time' ? 'Time' : 'Distance'}
                      </button>
                    ))}
                  </div>
                )}
                {(ex.category === 'timeonly' || (ex.target_type || 'time') === 'time') ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min="0"
                        value={Math.floor((parseFloat(ex.target_value) || 0) / 60) || ''}
                        onChange={e => {
                          const hrs = parseInt(e.target.value) || 0
                          const mins = Math.round((parseFloat(ex.target_value) || 0) % 60)
                          updateTarget(ex.tempId, 'target_value', hrs * 60 + mins)
                        }}
                        placeholder="0"
                        className="w-12 px-1 py-0.5 border border-[#ebebeb] text-xs text-center focus:outline-none focus:border-[#111] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-[#bbb]">hrs</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min="0" max="59"
                        value={Math.round((parseFloat(ex.target_value) || 0) % 60) || ''}
                        onChange={e => {
                          const hrs = Math.floor((parseFloat(ex.target_value) || 0) / 60)
                          const mins = Math.min(59, parseInt(e.target.value) || 0)
                          updateTarget(ex.tempId, 'target_value', hrs * 60 + mins)
                        }}
                        placeholder="0"
                        className="w-12 px-1 py-0.5 border border-[#ebebeb] text-xs text-center focus:outline-none focus:border-[#111] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-[#bbb]">min</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0" step="0.1"
                      value={ex.target_value || ''}
                      onChange={e => updateTarget(ex.tempId, 'target_value', e.target.value)}
                      placeholder="target"
                      className="w-20 px-2 py-0.5 border border-[#ebebeb] text-xs focus:outline-none focus:border-[#111] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-[#bbb]">km</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showPicker ? (
        <ExercisePickerInline
          onSelect={(name, category) => {
            setExercises(prev => [...prev, {
              tempId: `t-${Math.random()}`,
              name,
              category,
              default_sets: STRENGTH_CATS.includes(category) ? 3 : null,
              target_type: 'time',
              target_value: '',
              order_index: exercises.length
            }])
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      ) : (
        <button onClick={() => setShowPicker(true)} className="text-xs text-[#999] hover:text-[#111] transition-colors">
          + Add exercise
        </button>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-[#111] text-white text-sm hover:bg-[#333] transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save preset'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-[#ebebeb] text-sm text-[#666] hover:border-[#111] transition-colors">
          Cancel
        </button>
        {onDelete && (
          <button onClick={onDelete} className="ml-auto px-4 py-2 text-sm text-red-400 hover:text-red-600 transition-colors">
            Delete preset
          </button>
        )}
      </div>
    </div>
  )
}

function ExercisePickerInline({ onSelect, onClose }) {
  const [isStrength, setIsStrength] = useState(true)
  const [subTab, setSubTab] = useState('weights')
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
    <div className="border border-[#ebebeb] p-3 space-y-2">
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
      <div className="flex gap-1 flex-wrap">
        {(isStrength ? strengthTabs : cardioTabs).map(t => (
          <button key={t.id} onClick={() => { setSubTab(t.id); setSearch('') }}
            className={`px-2 py-0.5 text-xs transition-colors ${subTab === t.id ? 'bg-[#444] text-white' : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or type..." autoFocus
        className="w-full px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
      />
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {search && !exactMatch && (
          <button onClick={() => onSelect(search, subTab)} className="w-full text-left px-2 py-1.5 text-sm text-[#4F46E5] hover:bg-[#f7f7f7]">
            + Add "{search}"
          </button>
        )}
        {filtered.map(n => (
          <button key={n} onClick={() => onSelect(n, subTab)} className="w-full text-left px-2 py-1.5 text-sm text-[#111] hover:bg-[#f7f7f7]">
            {n}
          </button>
        ))}
      </div>
      <button onClick={onClose} className="text-xs text-[#999] hover:text-[#111]">Cancel</button>
    </div>
  )
}