import { Routes, Route, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import {
  loginWithSpotify,
  getAccessToken,
  getStoredToken,
} from "./spotifyAuth";
import { songs } from "./songDatabase";
import { getTrackTags, detectMoodFromTags } from "./lastfmService";

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

  function findSongInDB(currentTrack) {
    if (!currentTrack) return null;

    return songs.find(
      (s) =>
        s.title.toLowerCase().trim() === currentTrack.name.toLowerCase().trim() &&
        s.artist.toLowerCase().trim() ===
          currentTrack.artists?.[0]?.name.toLowerCase().trim()
    );
  }

  function getSimilarSongs(mood, currentSpotifyId) {
    const freshSongs = songs.filter(
      (s) =>
        s.mood === mood &&
        s.spotifyId !== currentSpotifyId &&
        !recentTrackIds.current.includes(s.spotifyId)
    );

    if (freshSongs.length > 0) return freshSongs;

    return songs.filter(
      (s) => s.mood === mood && s.spotifyId !== currentSpotifyId
    );
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
      const tags = await getTrackTags(title, artist);
      const mood = detectMoodFromTags(tags);

      return {
        spotifyId: spotifyTrack.id,
        title,
        artist,
        mood,
        energy: 5,
        tags,
      };
    } catch (error) {
      
      console.error("Last.fm error:", error);

      return {
        spotifyId: spotifyTrack.id,
        title,
        artist,
        mood: "unknown",
        energy: 5,
        tags: [],
      };
    }
  }

  async function buildMoodQueue(songData) {
    if (!songData || songData.mood === "unknown") {
      setMessage("Mood unknown, so queue was not changed.");
      return;
    }

    const similarSongs = getSimilarSongs(
      songData.mood,
      songData.spotifyId
    ).slice(0, 5);

    if (similarSongs.length === 0) {
      setMessage(`No ${songData.mood} songs available in suggestion list.`);
      return;
    }

    const added = [];

    for (const song of similarSongs) {
      const success = await addToQueue(song.spotifyId);

      if (success) {
        added.push(song);
        rememberTrack(song.spotifyId);
      }
    }

    setQueuedSongs(added);

    if (added.length > 0) {
      setMessage(`Added ${added.length} ${songData.mood} song(s) to queue.`);
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

      let songData = findSongInDB(currentTrack);

      if (!songData) {
        songData = await detectVibeWithLastFm(currentTrack);
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
    <div style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>MoodLock Queue 🎧</h1>
      <p>Keep your Spotify queue in the same vibe.</p>

      {!token ? (
        <button onClick={loginWithSpotify}>Login with Spotify</button>
      ) : (
        <>
          <h3>Spotify connected ✅</h3>
          <p>Auto mode is ON. Using only the local suggestion list.</p>

          {message && <p>{message}</p>}

          {track ? (
            <>
              <p>Now Playing:</p>
              <h2>{track.name}</h2>
              <p>{track.artists?.[0]?.name}</p>

              {currentSongData && (
                <>
                  <p>
                    Mood: <b>{currentSongData.mood}</b>
                  </p>

                  {currentSongData.tags?.length > 0 && (
                    <p>Tags: {currentSongData.tags.slice(0, 8).join(", ")}</p>
                  )}
                </>
              )}

              {queuedSongs.length > 0 && (
                <>
                  <h3>Suggested / Queued Songs:</h3>
                  <ul>
                    {queuedSongs.map((song) => (
                      <li key={song.spotifyId}>
                        {song.title} - {song.artist}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p>No song playing</p>
          )}
        </>
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