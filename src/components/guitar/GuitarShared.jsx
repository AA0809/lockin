import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const STATUS_LABELS = { to_learn: 'To Learn', learning: 'Learning', learned: 'Learned' }
const STATUS_COLORS = {
  to_learn: 'text-[#999] border-[#e0e0e0]',
  learning: 'text-[#4F46E5] border-[#c7c5f4]',
  learned: 'text-[#16a34a] border-[#bbf7d0]'
}

const DIFFICULTY_LABELS = {
  comfortable: 'Comfortable',
  challenging: 'Challenging',
  stretch: 'Stretch'
}

const DIFFICULTY_COLORS = {
  comfortable: 'text-[#16a34a] border-[#bbf7d0]',
  challenging: 'text-[#4F46E5] border-[#c7c5f4]',
  stretch: 'text-[#dc2626] border-[#fecaca]'
}

export { STATUS_LABELS, STATUS_COLORS, DIFFICULTY_LABELS, DIFFICULTY_COLORS }

export function DifficultyPicker({ value, onChange, readonly }) {
  if (readonly) {
    if (!value) return null
    return (
      <span className={`text-xs px-1.5 py-0.5 border ${DIFFICULTY_COLORS[value] || 'text-[#999] border-[#e0e0e0]'}`}>
        {DIFFICULTY_LABELS[value] || value}
      </span>
    )
  }
  return (
    <div className="flex gap-1">
      {Object.entries(DIFFICULTY_LABELS).map(([key, label]) => (
        <button key={key}
          onClick={() => onChange(value === key ? null : key)}
          className={`px-2 py-1 text-xs border transition-colors ${value === key ? 'bg-[#111] text-white border-[#111]' : 'border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function TagInput({ tableName, userIdField = 'user_id', labelField = 'name', selected, onChange, placeholder = 'Add tag...' }) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState([])
  const [allTags, setAllTags] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase.from(tableName).select('*').eq(userIdField, user.id).order(labelField)
      setAllTags(data || [])
    }
    load()
  }, [tableName])

  useEffect(() => {
    if (!search.trim()) { setOptions([]); return }
    const filtered = allTags.filter(t =>
      t[labelField].toLowerCase().includes(search.toLowerCase()) &&
      !selected.find(s => s.id === t.id)
    )
    setOptions(filtered)
  }, [search, allTags, selected])

  async function addTag(tag) {
    onChange([...selected, tag])
    setSearch('')
    setOptions([])
    inputRef.current?.focus()
  }

  async function createAndAdd() {
    if (!search.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from(tableName)
      .upsert({ [userIdField]: user.id, [labelField]: search.trim() }, { onConflict: `${userIdField},${labelField}` })
      .select().single()
    if (!error && data) {
      setAllTags(prev => [...prev.filter(t => t.id !== data.id), data])
      addTag(data)
    }
  }

  function removeTag(id) {
    onChange(selected.filter(t => t.id !== id))
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1">
        {selected.map(tag => (
          <span key={tag.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#f0f0f0] text-xs text-[#444]">
            {tag[labelField]}
            <button onClick={() => removeTag(tag.id)} className="text-[#bbb] hover:text-[#444]">✕</button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createAndAdd() } }}
          placeholder={placeholder}
          className="w-full px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
        />
        {(options.length > 0 || search.trim()) && (
          <div className="absolute top-full left-0 right-0 bg-white border border-[#ebebeb] border-t-0 z-10 max-h-36 overflow-y-auto">
            {search.trim() && !options.find(o => o[labelField].toLowerCase() === search.toLowerCase()) && (
              <button onClick={createAndAdd} className="w-full text-left px-3 py-2 text-sm text-[#4F46E5] hover:bg-[#f7f7f7]">
                + Create "{search}"
              </button>
            )}
            {options.map(tag => (
              <button key={tag.id} onClick={() => addTag(tag)} className="w-full text-left px-3 py-2 text-sm text-[#111] hover:bg-[#f7f7f7]">
                {tag[labelField]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function BpmInput({ bpm, percentage, targetBpm, onBpmChange, onPercentageChange }) {
  function handleBpm(v) {
    onBpmChange(v)
    if (v && targetBpm) onPercentageChange(Math.round((parseInt(v) / targetBpm) * 100))
  }
  function handlePct(v) {
    onPercentageChange(v)
    if (v && targetBpm) onBpmChange(Math.round((parseInt(v) / 100) * targetBpm))
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1">
        <input type="number" min="1" value={bpm || ''}
          onChange={e => handleBpm(e.target.value)} placeholder="BPM"
          className="w-16 px-2 py-1.5 border border-[#ebebeb] text-sm text-center focus:outline-none focus:border-[#111] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs text-[#bbb]">bpm</span>
      </div>
      {targetBpm && (
        <>
          <span className="text-xs text-[#ccc]">/</span>
          <div className="flex items-center gap-1">
            <input type="number" min="1" max="200" value={percentage || ''}
              onChange={e => handlePct(e.target.value)} placeholder="%"
              className="w-14 px-2 py-1.5 border border-[#ebebeb] text-sm text-center focus:outline-none focus:border-[#111] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs text-[#bbb]">%</span>
          </div>
        </>
      )}
    </div>
  )
}

export function formatDuration(minutes) {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}min`
  if (h > 0) return `${h}h`
  return `${m}min`
}

export function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => onChange(n === value ? null : n)}
          className={`text-2xl transition-colors ${n <= (value || 0) ? 'text-[#111]' : 'text-[#ddd]'}`}>
          ★
        </button>
      ))}
    </div>
  )
}