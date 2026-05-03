import { supabase } from "./supabaseClient";

export async function findSongBySpotifyId(spotifyId) {
  const { data, error } = await supabase
    .from("songs")
    .select("*")
    .eq("spotify_id", spotifyId)
    .maybeSingle();

  if (error) {
    console.error("Supabase find error:", error);
    return null;
  }

  return data;
}

export async function saveSongToDB(song) {
  const { data, error } = await supabase
    .from("songs")
    .upsert(
      {
        spotify_id: song.spotifyId,
        title: song.title,
        artist: song.artist,
        mood: song.mood,
        energy: song.energy || 5,
        tags: song.tags || [],
        source: song.source || "lastfm",
      },
      { onConflict: "spotify_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("Supabase save error:", error);
    return null;
  }

  return data;
}

export async function getSimilarSongsFromDB(mood, currentSpotifyId, limit = 5) {
  const { data, error } = await supabase
    .from("songs")
    .select("*")
    .eq("mood", mood)
    .neq("spotify_id", currentSpotifyId)
    .limit(limit);

  if (error) {
    console.error("Supabase similar songs error:", error);
    return [];
  }

  return data;
}