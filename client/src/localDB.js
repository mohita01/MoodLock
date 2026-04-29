const STORAGE_KEY = "moodlock_songs";
const PROCESSED_KEY = "moodlock_processed";

export function getStoredSongs() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveSong(song) {
  const existing = getStoredSongs();

  const alreadyExists = existing.find(
    (s) => s.spotifyId === song.spotifyId
  );

  if (!alreadyExists) {
    const updated = [...existing, song];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
}

// ✅ NEW: processed tracks
export function getProcessedTracks() {
  const data = localStorage.getItem(PROCESSED_KEY);
  return data ? JSON.parse(data) : [];
}

export function markTrackProcessed(trackId) {
  const existing = getProcessedTracks();

  const updated = [trackId, ...existing.filter((id) => id !== trackId)].slice(
    0,
    20
  );

  localStorage.setItem(PROCESSED_KEY, JSON.stringify(updated));
}