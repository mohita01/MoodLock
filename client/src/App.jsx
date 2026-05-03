import { Routes, Route, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import {
  loginWithSpotify,
  getAccessToken,
  getStoredToken,
} from "./spotifyAuth";
import { getTrackTags, detectMoodFromTags } from "./lastfmService";
import {
  findSongBySpotifyId,
  saveSongToDB,
  getSimilarSongsFromDB,
} from "./songService";

function Home() {
  const token = getStoredToken();

  const [track, setTrack] = useState(null);
  const [currentSongData, setCurrentSongData] = useState(null);
  const [queuedSongs, setQueuedSongs] = useState([]);
  const [message, setMessage] = useState("");

  const lastProcessedTrackId = useRef(null);
  const recentTrackIds = useRef([]);

  function rememberTrack(trackId) {
    recentTrackIds.current = [
      trackId,
      ...recentTrackIds.current.filter((id) => id !== trackId),
    ].slice(0, 5);
  }

  async function addToQueue(trackId) {
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/queue?uri=spotify:track:${trackId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return res.ok;
  }

  async function detectVibeWithLastFm(spotifyTrack) {
    const title = spotifyTrack.name;
    const artist = spotifyTrack.artists?.[0]?.name;

    try {
      setMessage("Detecting vibe using Last.fm...");

      const tags = await getTrackTags(title, artist);
      const mood = detectMoodFromTags(tags);

      const detectedSong = {
        spotifyId: spotifyTrack.id,
        title,
        artist,
        mood,
        energy: 5,
        tags,
        source: tags.length > 0 ? "lastfm" : "not_found",
      };

      if (mood !== "unknown") {
        await saveSongToDB(detectedSong);
      }

      return detectedSong;
    } catch (error) {
      console.error("Last.fm error:", error);

      return {
        spotifyId: spotifyTrack.id,
        title,
        artist,
        mood: "unknown",
        energy: 5,
        tags: [],
        source: "error",
      };
    }
  }

  async function buildMoodQueue(songData) {
    if (!songData || songData.mood === "unknown") {
      setMessage("Mood unknown, so queue was not changed.");
      return;
    }

    const dbSongs = await getSimilarSongsFromDB(
      songData.mood,
      songData.spotifyId,
      10
    );

    const freshSongs = dbSongs
      .filter((song) => !recentTrackIds.current.includes(song.spotify_id))
      .slice(0, 5);

    if (freshSongs.length === 0) {
      setMessage(`No fresh ${songData.mood} songs found in Supabase.`);
      return;
    }

    const added = [];

    for (const song of freshSongs) {
      const success = await addToQueue(song.spotify_id);

      if (success) {
        added.push(song);
        rememberTrack(song.spotify_id);
      }
    }

    setQueuedSongs(added);

    if (added.length > 0) {
      setMessage(`Added ${added.length} ${songData.mood} song(s) from Supabase.`);
    } else {
      setMessage("Could not add songs. Make sure Spotify Premium is active.");
    }
  }

  async function fetchCurrentTrack() {
    if (!token) return;

    try {
      const res = await fetch("https://api.spotify.com/v1/me/player", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 204) {
        setTrack(null);
        setCurrentSongData(null);
        setMessage("No active Spotify device found.");
        return;
      }

      if (res.status === 401) {
        localStorage.clear();
        setTrack(null);
        setCurrentSongData(null);
        setMessage("Spotify login expired. Please login again.");
        return;
      }

      if (!res.ok) {
        setMessage("Could not fetch Spotify playback.");
        return;
      }

      const data = await res.json();

      if (!data?.item) {
        setTrack(null);
        setCurrentSongData(null);
        setMessage("No song currently playing.");
        return;
      }

      const currentTrack = data.item;
      setTrack(currentTrack);

      if (lastProcessedTrackId.current === currentTrack.id) return;

      lastProcessedTrackId.current = currentTrack.id;
      rememberTrack(currentTrack.id);

      let songDataFromDB = await findSongBySpotifyId(currentTrack.id);
      let songData;

      if (songDataFromDB) {
        songData = {
          spotifyId: songDataFromDB.spotify_id,
          title: songDataFromDB.title,
          artist: songDataFromDB.artist,
          mood: songDataFromDB.mood,
          energy: songDataFromDB.energy,
          tags: songDataFromDB.tags || [],
          source: songDataFromDB.source || "supabase",
        };

        setMessage("Mood found from Supabase.");
      } else {
        songData = await detectVibeWithLastFm(currentTrack);

        if (songData.mood === "unknown") {
          setMessage("Last.fm could not detect mood for this song.");
        } else {
          setMessage("Mood detected using Last.fm and saved to Supabase.");
        }
      }

      setCurrentSongData(songData);
      await buildMoodQueue(songData);
    } catch (error) {
      console.error("Spotify fetch error:", error);
      setMessage(`Spotify error: ${error.message}`);
    }
  }

  useEffect(() => {
    fetchCurrentTrack();

    const interval = setInterval(() => {
      fetchCurrentTrack();
    }, 10000);

    return () => clearInterval(interval);
  }, [token]);

  return (
    <div className="app">
      <div className="hero">
        <h1 className="title">🎧 MoodLock </h1>
        <p className="subtitle">
          AI-powered Spotify queue that keeps your music in the same vibe.
        </p>
      </div>

      {!token ? (
        <div className="card empty">
          <h2>Connect your Spotify</h2>
          <p className="status">
            Login to start detecting your current song and auto-building your queue.
          </p>
          <button className="button" onClick={loginWithSpotify}>
            Connect Spotify
          </button>
        </div>
      ) : (
        <div className="grid">
          <div className="card">
            {track ? (
              <div className="now-playing">
                <img
                  className="album"
                  src={track.album?.images?.[0]?.url}
                  alt={track.name}
                />

                <div>
                  <p className="label">Now Playing</p>
                  <h2 className="track-title">{track.name}</h2>
                  <p className="artist">{track.artists?.[0]?.name}</p>

                  {currentSongData && (
                    <>
                      <div className="mood">
                        {currentSongData.mood.toUpperCase()}
                      </div>

                      {currentSongData.tags?.length > 0 && (
                        <p className="tags">
                          {currentSongData.tags.slice(0, 8).join(" • ")}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty">
                <h2>No song playing</h2>
                <p className="status">Play a song on Spotify to begin.</p>
              </div>
            )}
          </div>

          <div className="card">
            <p className="label">Mood Engine</p>
            <h2>Auto Mode ON ✅</h2>
            <p className="status">
              {message || "Waiting for Spotify playback..."}
            </p>
          </div>

          {queuedSongs.length > 0 && (
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <p className="label">Up Next</p>
              <h2>Queued Songs</h2>

              <div className="song-list">
                {queuedSongs.map((song) => (
                  <div className="song-item" key={song.spotify_id}>
                    <b>{song.title}</b>
                    <span>{song.artist}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        await getAccessToken(code);
        navigate("/");
      }
    }

    handleCallback();
  }, [navigate]);

  return <h2 style={{ padding: "40px" }}>Connecting Spotify...</h2>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/callback" element={<Callback />} />
    </Routes>
  );
}