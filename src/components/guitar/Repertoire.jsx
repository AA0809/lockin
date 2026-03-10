import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { searchSpotifyTracks, getTrackBPM, openInSpotify } from './spotify'
import { STATUS_LABELS, STATUS_COLORS, DIFFICULTY_LABELS, DIFFICULTY_COLORS, DifficultyPicker, TagInput, BpmInput, formatDuration } from './GuitarShared'

const PART_SUGGESTIONS = ['Intro', 'Main Riff', 'Solo', 'Everything But Solo', 'Verse Riff', 'Bridge', 'Chorus']

// Derive song display status from parts
function getSongDisplayStatus(song) {
  const parts = song.song_parts || []
  if (parts.length === 0) return { banner: song.status, inProgress: false }
  const allLearned = parts.every(p => p.status === 'learned')
  const anyLearning = parts.some(p => p.status === 'learning')
  const someLearned = parts.some(p => p.status === 'learned')
  if (allLearned && song.full_song_learned) return { banner: 'learned', inProgress: false }
  if (allLearned && !song.full_song_learned) return { banner: 'part_learned', inProgress: false }
  if (someLearned && anyLearning) return { banner: 'part_learned', inProgress: true }
  if (someLearned) return { banner: 'part_learned', inProgress: false }
  if (anyLearning) return { banner: 'learning', inProgress: true }
  return { banner: 'to_learn', inProgress: false }
}

export default function Repertoire() {
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSong, setSelectedSong] = useState(null)
  const [showAddSong, setShowAddSong] = useState(false)
  const [filterDifficulty, setFilterDifficulty] = useState(null)
  const [filterStyleTag, setFilterStyleTag] = useState(null)
  const [styleTags, setStyleTags] = useState([])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: songsData }, { data: tagsData }] = await Promise.all([
      supabase.from('songs')
        .select(`*, song_parts(*), song_style_tags(*, style_tags(*))`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('style_tags').select('*').eq('user_id', user.id).order('name')
    ])
    setSongs(songsData || [])
    setStyleTags(tagsData || [])
    setLoading(false)
  }

  const filtered = songs.filter(s => {
    if (filterDifficulty && s.difficulty !== filterDifficulty) return false
    if (filterStyleTag && !s.song_style_tags?.find(t => t.style_tag_id === filterStyleTag)) return false
    return true
  })

  const groups = [
    { key: 'learning', label: 'Learning' },
    { key: 'part_learned', label: 'Part Learned' },
    { key: 'to_learn', label: 'To Learn' },
    { key: 'learned', label: 'Learned' },
  ]

  if (loading) return <p className="text-sm text-[#999]">Loading...</p>

  if (selectedSong) {
    return <SongDetail songId={selectedSong} onBack={() => { setSelectedSong(null); fetchAll() }} />
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-[#999] uppercase tracking-wider">Repertoire</h2>
        <button onClick={() => setShowAddSong(true)}
          className="text-xs px-3 py-1.5 bg-[#111] text-white hover:bg-[#333] transition-colors">
          + Add song
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(DIFFICULTY_LABELS).map(([key, label]) => (
          <button key={key} onClick={() => setFilterDifficulty(filterDifficulty === key ? null : key)}
            className={`px-3 py-1 text-xs transition-colors ${filterDifficulty === key ? 'bg-[#111] text-white' : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
            {label}
          </button>
        ))}
        {styleTags.map(tag => (
          <button key={tag.id} onClick={() => setFilterStyleTag(filterStyleTag === tag.id ? null : tag.id)}
            className={`px-3 py-1 text-xs transition-colors ${filterStyleTag === tag.id ? 'bg-[#111] text-white' : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
            {tag.name}
          </button>
        ))}
      </div>

      {/* Banners */}
      {groups.map(group => {
        const groupSongs = filtered.filter(s => getSongDisplayStatus(s).banner === group.key)
        if (groupSongs.length === 0) return null
        return (
          <div key={group.key}>
            <p className="text-xs font-medium text-[#999] uppercase tracking-wider mb-2">{group.label}</p>
            <div className="space-y-2">
              {groupSongs.map(song => {
                const { inProgress } = getSongDisplayStatus(song)
                return <SongCard key={song.id} song={song} inProgress={inProgress} onClick={() => setSelectedSong(song.id)} />
              })}
            </div>
          </div>
        )
      })}

      {filtered.length === 0 && (
        <p className="text-sm text-[#999]">No songs yet.</p>
      )}

      {showAddSong && (
        <AddSongModal onSave={() => { setShowAddSong(false); fetchAll() }} onCancel={() => setShowAddSong(false)} />
      )}
    </div>
  )
}

function SongCard({ song, inProgress, onClick }) {
  const parts = song.song_parts || []
  const learnedParts = parts.filter(p => p.status === 'learned').length
  const tags = song.song_style_tags?.map(t => t.style_tags?.name).filter(Boolean) || []

  return (
    <button onClick={onClick} className="w-full text-left bg-white border border-[#ebebeb] hover:border-[#111] transition-colors flex items-center gap-3 p-3">
      {song.cover_art_url ? (
        <img src={song.cover_art_url} alt="" className="w-12 h-12 object-cover shrink-0" />
      ) : (
        <div className="w-12 h-12 bg-[#f0f0f0] shrink-0 flex items-center justify-center text-[#ccc] text-lg">♪</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-[#111] truncate">{song.title}</p>
          {inProgress && (
            <span className="text-xs px-1.5 py-0.5 border text-[#4F46E5] border-[#c7c5f4] shrink-0">In progress</span>
          )}
        </div>
        <p className="text-xs text-[#999] truncate">{song.artist || 'Unknown artist'}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {song.difficulty && (
            <span className={`text-xs px-1.5 py-0.5 border ${DIFFICULTY_COLORS[song.difficulty]}`}>
              {DIFFICULTY_LABELS[song.difficulty]}
            </span>
          )}
          {parts.length > 0 && (
            <span className="text-xs text-[#bbb]">{learnedParts}/{parts.length} parts</span>
          )}
          {song.current_bpm && song.target_bpm && (
            <span className="text-xs text-[#bbb]">{Math.round((song.current_bpm / song.target_bpm) * 100)}%</span>
          )}
          {tags.slice(0, 2).map(t => (
            <span key={t} className="text-xs text-[#bbb] bg-[#f5f5f5] px-1.5 py-0.5">{t}</span>
          ))}
        </div>
      </div>
      <span className="text-[#ccc] text-xs shrink-0">›</span>
    </button>
  )
}

function SongDetail({ songId, onBack }) {
  const [song, setSong] = useState(null)
  const [parts, setParts] = useState([])
  const [practiceHistory, setPracticeHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [showAddPart, setShowAddPart] = useState(false)
  const [newPartName, setNewPartName] = useState('')
  const [newPartTechs, setNewPartTechs] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchSong() }, [songId])

  async function fetchSong() {
    const [{ data: s }, { data: p }, { data: history }] = await Promise.all([
      supabase.from('songs').select(`*, song_style_tags(*, style_tags(*))`).eq('id', songId).single(),
      supabase.from('song_parts').select('*').eq('song_id', songId).order('created_at'),
      supabase.from('block_song_entries')
        .select(`id, bpm, percentage, notes, part_id, practice_blocks(started_at, duration_minutes, guitar_sessions(date))`)
        .eq('song_id', songId)
        .order('id', { ascending: false })
        .limit(20)
    ])
    setSong(s)
    setParts(p || [])
    setPracticeHistory(history || [])
    setNotes(s?.notes || '')
    setLoading(false)
  }

  async function saveNotes() {
    await supabase.from('songs').update({ notes }).eq('id', songId)
    setEditingNotes(false)
    fetchSong()
  }

  async function updateSongField(field, value) {
    await supabase.from('songs').update({ [field]: value }).eq('id', songId)
    fetchSong()
  }

  async function toggleFullSongLearned() {
    const newVal = !song.full_song_learned
    await supabase.from('songs').update({ full_song_learned: newVal }).eq('id', songId)
    fetchSong()
  }

  async function updatePartStatus(partId, status) {
    const updates = { status }
    if (status === 'learned') updates.date_learned = new Date().toISOString().split('T')[0]
    await supabase.from('song_parts').update(updates).eq('id', partId)
    fetchSong()
  }

  async function addPart() {
    if (!newPartName.trim()) return
    setSaving(true)
    await supabase.from('song_parts').insert({
      song_id: songId,
      name: newPartName.trim(),
      target_bpm: song.target_bpm,
      technique_tags: newPartTechs.map(t => ({ id: t.id, name: t.name }))
    })
    setNewPartName('')
    setNewPartTechs([])
    setShowAddPart(false)
    setSaving(false)
    fetchSong()
  }

  async function deletePart(partId) {
    if (!confirm('Delete this part?')) return
    await supabase.from('song_parts').delete().eq('id', partId)
    fetchSong()
  }

  if (loading) return <p className="text-sm text-[#999]">Loading...</p>
  if (!song) return null

  const allPartsLearned = parts.length > 0 && parts.every(p => p.status === 'learned')
  const tags = song.song_style_tags?.map(t => t.style_tags?.name).filter(Boolean) || []

  function formatDate(d) {
    if (!d) return '—'
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function formatDateShort(d) {
    if (!d) return '—'
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  return (
    <div className="max-w-2xl space-y-5 pb-8">
      <button onClick={onBack} className="text-xs text-[#999] hover:text-[#111] transition-colors">← Repertoire</button>

      {/* Header */}
      <div className="flex gap-4">
        {song.cover_art_url ? (
          <img src={song.cover_art_url} alt="" className="w-20 h-20 object-cover shrink-0" />
        ) : (
          <div className="w-20 h-20 bg-[#f0f0f0] shrink-0 flex items-center justify-center text-[#ccc] text-3xl">♪</div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-[#111]">{song.title}</h2>
          <p className="text-sm text-[#666]">{song.artist || 'Unknown artist'}</p>
          {song.album && <p className="text-xs text-[#bbb]">{song.album}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {tags.map(t => <span key={t} className="text-xs bg-[#f5f5f5] text-[#666] px-1.5 py-0.5">{t}</span>)}
            {song.spotify_id && (
              <button onClick={() => openInSpotify(song.spotify_id)} className="text-xs text-[#1DB954] hover:underline">
                Open in Spotify ↗
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status + Difficulty */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-[#bbb] mb-1.5">Status <span className="text-[#ccc]">(manual override)</span></p>
          <div className="flex gap-1 flex-wrap">
            {['to_learn','learning','learned'].map(s => (
              <button key={s} onClick={() => updateSongField('status', s)}
                className={`px-2 py-1 text-xs transition-colors ${song.status === s ? 'bg-[#111] text-white' : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          {parts.length > 0 && (
            <p className="text-xs text-[#bbb] mt-1">
              Display: <span className="text-[#666]">{
                (() => {
                  const { banner } = getSongDisplayStatus({ ...song, song_parts: parts })
                  return banner === 'part_learned' ? 'Part Learned' : STATUS_LABELS[banner] || banner
                })()
              }</span> (derived from parts)
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-[#bbb] mb-1.5">Difficulty</p>
          <DifficultyPicker value={song.difficulty} onChange={v => updateSongField('difficulty', v)} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Started', value: formatDate(song.date_started) },
          { label: 'Learned', value: formatDate(song.date_learned) },
          { label: 'Sessions', value: practiceHistory.length || '0' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#f9f9f9] p-3">
            <p className="text-xs text-[#bbb]">{label}</p>
            <p className="text-sm font-medium text-[#111] mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* BPM */}
      {song.target_bpm && (
        <div className="bg-[#f9f9f9] p-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#bbb]">Target BPM</p>
            <p className="text-sm font-medium text-[#111]">{song.target_bpm}</p>
          </div>
          {song.current_bpm && (
            <div className="text-right">
              <p className="text-xs text-[#bbb]">Current</p>
              <p className="text-sm font-medium text-[#111]">
                {song.current_bpm} <span className="text-xs text-[#999]">({Math.round((song.current_bpm / song.target_bpm) * 100)}%)</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Parts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-[#999] uppercase tracking-wider">Parts</p>
          <button onClick={() => setShowAddPart(true)} className="text-xs text-[#999] hover:text-[#111]">+ Add part</button>
        </div>

        {parts.length === 0 && !showAddPart && (
          <p className="text-xs text-[#bbb]">No parts — learning as one piece.</p>
        )}

        <div className="space-y-1">
          {parts.map(part => (
            <div key={part.id} className="flex items-center gap-2 p-2 bg-white border border-[#ebebeb]">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#111]">{part.name}</p>
                <div className="flex gap-2 mt-0.5 flex-wrap">
                  {(part.technique_tags || []).map(t => (
                    <span key={t.id} className="text-xs text-[#bbb] bg-[#f5f5f5] px-1">{t.name}</span>
                  ))}
                  {part.current_bpm && part.target_bpm && (
                    <span className="text-xs text-[#bbb]">{part.current_bpm} BPM · {Math.round((part.current_bpm / part.target_bpm) * 100)}%</span>
                  )}
                  {part.date_learned && (
                    <span className="text-xs text-[#bbb]">Learned {formatDateShort(part.date_learned)}</span>
                  )}
                </div>
              </div>
              <select value={part.status} onChange={e => updatePartStatus(part.id, e.target.value)}
                className="text-xs border border-[#ebebeb] px-1 py-1 focus:outline-none focus:border-[#111]">
                <option value="to_learn">To Learn</option>
                <option value="learning">Learning</option>
                <option value="learned">Learned</option>
              </select>
              <button onClick={() => deletePart(part.id)} className="text-[#ccc] hover:text-red-400 text-xs">✕</button>
            </div>
          ))}
        </div>

        {/* Full song checkbox */}
        {parts.length > 0 && (
          <label className={`flex items-center gap-2 mt-2 cursor-pointer ${!allPartsLearned ? 'opacity-40' : ''}`}>
            <input type="checkbox" checked={song.full_song_learned || false}
              onChange={toggleFullSongLearned}
              disabled={!allPartsLearned}
              className="w-3.5 h-3.5"
            />
            <span className="text-xs text-[#666]">Full song learned</span>
            {!allPartsLearned && <span className="text-xs text-[#bbb]">(learn all parts first)</span>}
          </label>
        )}

        {/* Add part form */}
        {showAddPart && (
          <div className="mt-2 p-3 border border-[#ebebeb] space-y-2">
            <div className="flex flex-wrap gap-1">
              {PART_SUGGESTIONS.map(s => (
                <button key={s} onClick={() => setNewPartName(s)}
                  className={`px-2 py-0.5 text-xs transition-colors ${newPartName === s ? 'bg-[#111] text-white' : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                  {s}
                </button>
              ))}
            </div>
            <input value={newPartName} onChange={e => setNewPartName(e.target.value)}
              placeholder="Custom name..."
              className="w-full px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
            />
            <div>
              <p className="text-xs text-[#bbb] mb-1">Techniques practiced in this part</p>
              <TagInput tableName="guitar_techniques" labelField="name"
                selected={newPartTechs} onChange={setNewPartTechs}
                placeholder="e.g. Downpicking, Sweep picking..."
              />
            </div>
            <div className="flex gap-2">
              <button onClick={addPart} disabled={!newPartName.trim() || saving}
                className="px-3 py-1.5 bg-[#111] text-white text-xs disabled:opacity-50">
                {saving ? 'Adding...' : 'Add part'}
              </button>
              <button onClick={() => setShowAddPart(false)} className="text-xs text-[#999]">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Songsterr */}
      {song.songsterr_url && (
        <a href={song.songsterr_url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-[#4F46E5] hover:underline block">View on Songsterr ↗</a>
      )}

      {/* Notes */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-[#999] uppercase tracking-wider">Notes</p>
          {!editingNotes && <button onClick={() => setEditingNotes(true)} className="text-xs text-[#999] hover:text-[#111]">Edit</button>}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              placeholder="Tips, focus points, observations..."
              className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111] resize-none"
            />
            <div className="flex gap-2">
              <button onClick={saveNotes} className="px-3 py-1.5 bg-[#111] text-white text-xs">Save</button>
              <button onClick={() => { setEditingNotes(false); setNotes(song.notes || '') }} className="text-xs text-[#999]">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#666] whitespace-pre-wrap">{notes || <span className="text-[#bbb]">No notes yet.</span>}</p>
        )}
      </div>

      {/* Practice history */}
      {practiceHistory.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[#999] uppercase tracking-wider mb-2">Practice History</p>
          <div className="space-y-1">
            {practiceHistory.map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-2 bg-[#f9f9f9] text-xs">
                <div>
                  <span className="text-[#111]">
                    {entry.practice_blocks?.guitar_sessions?.date
                      ? formatDateShort(entry.practice_blocks.guitar_sessions.date)
                      : '—'}
                  </span>
                  {entry.notes && <span className="text-[#999] ml-2">{entry.notes}</span>}
                </div>
                <div className="flex items-center gap-2 text-[#999]">
                  {entry.bpm && <span>{entry.bpm} BPM</span>}
                  {entry.percentage && <span>{entry.percentage}%</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function AddSongModal({ onSave, onCancel, preSelect }) {
  const [step, setStep] = useState('search') // 'search' | 'form'
  const [query, setQuery] = useState(preSelect || '')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [spotifyBpm, setSpotifyBpm] = useState(null)
  const [loadingBpm, setLoadingBpm] = useState(false)
  const [form, setForm] = useState({
    title: '', artist: '', target_bpm: '', status: 'to_learn', difficulty: null
  })
  const [parts, setParts] = useState([])
  const [newPartName, setNewPartName] = useState('')
  const [newPartTechs, setNewPartTechs] = useState([])
  const [songStyleTags, setSongStyleTags] = useState([])
  const [saving, setSaving] = useState(false)
  const searchTimer = useRef(null)

  useEffect(() => { if (preSelect) doSearch(preSelect) }, [])

  function doSearch(q) {
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const res = await searchSpotifyTracks(q)
      setResults(res)
      setSearching(false)
    }, 400)
  }

  async function selectSpotifyTrack(track) {
    setSelected(track)
    setForm(f => ({ ...f, title: track.title, artist: track.artist }))
    setStep('form')
    setLoadingBpm(true)
    const bpm = await getTrackBPM(track.spotify_id)
    setSpotifyBpm(bpm)
    setForm(f => ({ ...f, target_bpm: bpm || '' }))
    setLoadingBpm(false)
  }

  function addPart() {
    if (!newPartName.trim()) return
    setParts(prev => [...prev, {
      tempId: `p-${Date.now()}`,
      name: newPartName.trim(),
      techniques: newPartTechs
    }])
    setNewPartName('')
    setNewPartTechs([])
  }

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr) { setSaving(false); return }

    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      artist: form.artist?.trim() || null,
      target_bpm: form.target_bpm ? parseInt(form.target_bpm) : null,
      difficulty: form.difficulty || null,
      status: form.status,
      date_started: new Date().toISOString().split('T')[0],
      ...(selected ? {
        spotify_id: selected.spotify_id,
        cover_art_url: selected.cover_art_url || null,
        album: selected.album || null,
      } : {})
    }

    const { data: song, error } = await supabase.from('songs').insert(payload).select().single()
    if (error) { console.error('Save error:', error); setSaving(false); return }

    // Save style tags
    if (songStyleTags.length > 0) {
      await supabase.from('song_style_tags').insert(
        songStyleTags.map(t => ({ song_id: song.id, style_tag_id: t.id }))
      )
    }

    // Save parts
    if (parts.length > 0) {
      await supabase.from('song_parts').insert(
        parts.map(p => ({
          song_id: song.id,
          name: p.name,
          target_bpm: form.target_bpm ? parseInt(form.target_bpm) : null,
          technique_tags: p.techniques.map(t => ({ id: t.id, name: t.name }))
        }))
      )
    }

    onSave()
  }

  if (step === 'search') {
    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-4">
        <div className="bg-white w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Add song</h3>
            <button onClick={onCancel} className="text-xs text-[#999] hover:text-[#111]">Cancel</button>
          </div>
          <div className="relative">
            <input value={query} onChange={e => { setQuery(e.target.value); doSearch(e.target.value) }}
              placeholder="Search Spotify..." autoFocus
              className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
            />
            {searching && <span className="absolute right-3 top-2.5 text-xs text-[#bbb]">Searching...</span>}
          </div>
          <div className="space-y-0.5">
            {results.map(track => (
              <button key={track.spotify_id} onClick={() => selectSpotifyTrack(track)}
                className="w-full flex items-center gap-3 p-2 hover:bg-[#f7f7f7] text-left transition-colors">
                {track.cover_art_url && <img src={track.cover_art_url} alt="" className="w-10 h-10 object-cover shrink-0" />}
                <div>
                  <p className="text-sm text-[#111]">{track.title}</p>
                  <p className="text-xs text-[#999]">{track.artist} · {track.album}</p>
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => { setStep('form'); setSelected(null) }} className="text-xs text-[#999] hover:text-[#111]">
            + Add manually
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setStep('search')} className="text-xs text-[#999] hover:text-[#111]">← Back</button>
          <button onClick={onCancel} className="text-xs text-[#999] hover:text-[#111]">Cancel</button>
        </div>

        {selected && (
          <div className="flex items-center gap-3 p-2 bg-[#f9f9f9]">
            {selected.cover_art_url && <img src={selected.cover_art_url} alt="" className="w-10 h-10 object-cover shrink-0" />}
            <div>
              <p className="text-sm font-medium text-[#111]">{selected.title}</p>
              <p className="text-xs text-[#999]">{selected.artist}</p>
            </div>
          </div>
        )}

        {!selected && (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-[#bbb] block mb-1">Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Song title" autoFocus
                className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
              />
            </div>
            <div>
              <label className="text-xs text-[#bbb] block mb-1">Artist</label>
              <input value={form.artist} onChange={e => setForm(f => ({ ...f, artist: e.target.value }))}
                placeholder="Artist name"
                className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
              />
            </div>
          </div>
        )}

        {/* BPM */}
        <div>
          <label className="text-xs text-[#bbb] block mb-1">Target BPM {loadingBpm && <span className="text-[#ccc]">(fetching...)</span>}</label>
          <input type="number" min="1" value={form.target_bpm}
            onChange={e => setForm(f => ({ ...f, target_bpm: e.target.value }))}
            placeholder="e.g. 220"
            className="w-full px-3 py-2 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {spotifyBpm && (
            <div className="flex gap-2 mt-1.5 items-center">
              <span className="text-xs text-[#bbb]">Spotify suggests:</span>
              <button onClick={() => setForm(f => ({ ...f, target_bpm: spotifyBpm }))}
                className={`text-xs px-2 py-0.5 border transition-colors ${parseInt(form.target_bpm) === spotifyBpm ? 'bg-[#111] text-white border-[#111]' : 'border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                {spotifyBpm}
              </button>
              <button onClick={() => setForm(f => ({ ...f, target_bpm: spotifyBpm * 2 }))}
                className={`text-xs px-2 py-0.5 border transition-colors ${parseInt(form.target_bpm) === spotifyBpm * 2 ? 'bg-[#111] text-white border-[#111]' : 'border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                {spotifyBpm * 2} ×2
              </button>
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <label className="text-xs text-[#bbb] block mb-1.5">Status</label>
          <div className="flex gap-1">
            {['to_learn','learning','learned'].map(s => (
              <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                className={`px-2 py-1 text-xs transition-colors ${form.status === s ? 'bg-[#111] text-white' : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <label className="text-xs text-[#bbb] block mb-1.5">Difficulty</label>
          <DifficultyPicker value={form.difficulty} onChange={v => setForm(f => ({ ...f, difficulty: v }))} />
        </div>

        {/* Style tags */}
        <div>
          <label className="text-xs text-[#bbb] block mb-1.5">Style tags</label>
          <TagInput tableName="style_tags" labelField="name"
            selected={songStyleTags} onChange={setSongStyleTags}
            placeholder="e.g. Metal, Thrash, Fingerpicking..."
          />
        </div>

        {/* Parts */}
        <div>
          <p className="text-xs text-[#bbb] mb-2">Parts (optional)</p>
          {parts.map(p => (
            <div key={p.tempId} className="flex items-center gap-2 py-1 text-xs text-[#666]">
              <span className="flex-1">{p.name}</span>
              {p.techniques.length > 0 && <span className="text-[#bbb]">{p.techniques.map(t => t.name).join(', ')}</span>}
              <button onClick={() => setParts(prev => prev.filter(x => x.tempId !== p.tempId))}
                className="text-[#ccc] hover:text-red-400">✕</button>
            </div>
          ))}
          <div className="space-y-1.5 mt-1">
            <div className="flex flex-wrap gap-1">
              {PART_SUGGESTIONS.map(s => (
                <button key={s} onClick={() => setNewPartName(s)}
                  className={`px-2 py-0.5 text-xs transition-colors ${newPartName === s ? 'bg-[#111] text-white' : 'border border-[#ebebeb] text-[#666] hover:border-[#111]'}`}>
                  {s}
                </button>
              ))}
            </div>
            <input value={newPartName} onChange={e => setNewPartName(e.target.value)}
              placeholder="Custom part name..."
              className="w-full px-2 py-1.5 border border-[#ebebeb] text-sm focus:outline-none focus:border-[#111]"
            />
            <TagInput tableName="guitar_techniques" labelField="name"
              selected={newPartTechs} onChange={setNewPartTechs}
              placeholder="Technique tags for this part..."
            />
            <button onClick={addPart} disabled={!newPartName.trim()}
              className="text-xs text-[#999] hover:text-[#111] disabled:opacity-40">
              + Add part
            </button>
          </div>
        </div>

        <button onClick={save} disabled={saving || !form.title.trim()}
          className="w-full py-2.5 bg-[#111] text-white text-sm hover:bg-[#333] transition-colors disabled:opacity-50">
          {saving ? 'Adding...' : 'Add to repertoire'}
        </button>
      </div>
    </div>
  )
}