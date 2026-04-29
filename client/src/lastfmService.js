const LASTFM_API_KEY = import.meta.env.VITE_LASTFM_API_KEY;

function cleanTitle(title) {
  return title
    .replace(/- From ".*?"/gi, "")
    .replace(/\(From .*?\)/gi, "")
    .replace(/\[From .*?\]/gi, "")
    .replace(/- From .*$/gi, "")
    .trim();
}

async function fetchTags(title, artist) {
  const params = new URLSearchParams({
    method: "track.getInfo",
    api_key: LASTFM_API_KEY,
    artist,
    track: title,
    autocorrect: "1",
    format: "json",
  });

  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`);
  const data = await res.json();

  return data?.track?.toptags?.tag || [];
}

export async function getTrackTags(title, artist) {
  let tags = await fetchTags(title, artist);

  if (!tags.length) {
    const cleanedTitle = cleanTitle(title);
    tags = await fetchTags(cleanedTitle, artist);
  }

  return tags.map((tag) => tag.name.toLowerCase());
}

export function detectMoodFromTags(tags) {
  const moodMap = {
    chill: ["chill", "chillout", "lofi", "ambient", "soft", "calm", "relaxing"],
    sad: ["sad", "melancholy", "melancholic", "emotional", "heartbreak"],
    hype: ["hype", "energetic", "dance", "party", "power", "mass", "rock", "edm", "soundtrack"],
    romantic: ["romantic", "love", "soul", "r&b"],
    dark: ["dark", "metal", "gothic", "intense"],
    happy: ["happy", "pop", "feel good", "upbeat", "fun"],
  };

  for (const mood in moodMap) {
    if (tags.some((tag) => moodMap[mood].some((word) => tag.includes(word)))) {
      return mood;
    }
  }

  return "unknown";
}