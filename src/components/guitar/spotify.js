const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID
const CLIENT_SECRET = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET

let accessToken = null
let tokenExpiry = null

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) return accessToken
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)
    },
    body: 'grant_type=client_credentials'
  })
  const data = await res.json()
  accessToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return accessToken
}

export async function searchSpotifyTracks(query) {
  if (!query || query.length < 2) return []
  try {
    const token = await getAccessToken()
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=8`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    return (data.tracks?.items || []).map(track => ({
      spotify_id: track.id,
      title: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      cover_art_url: track.album.images?.[1]?.url || track.album.images?.[0]?.url || null,
      spotify_url: track.external_urls.spotify,
    }))
  } catch (err) {
    console.error('Spotify search error:', err)
    return []
  }
}

export async function getTrackBPM(spotifyId) {
  // Spotify deprecated audio-features for client credentials in 2024
  // BPM must be entered manually by user
  return null
}

export function openInSpotify(spotifyId) {
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
  if (isMobile) {
    window.location.href = `spotify:track:${spotifyId}`
    setTimeout(() => {
      window.open(`https://open.spotify.com/track/${spotifyId}`, '_blank')
    }, 1000)
  } else {
    window.open(`https://open.spotify.com/track/${spotifyId}`, '_blank')
  }
}