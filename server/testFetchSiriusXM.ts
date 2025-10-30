import fetch from "node-fetch";

const BASE_URL = "https://player.siriusxm.com/rest/v4/experience";

const knownShowID = "a9f331ea-ffd6-06a4-978b-d597c6c2122e";
const showTitle = "Different Shades of Blue w Joe Bonamassa";

async function fetchPodcastEpisodes(podcastId: string) {
  const url = `${BASE_URL}/podcast/episodes?podcastId=${podcastId}&limit=100`;
  const res = await fetch(url);
  const json = await res.json();
  console.log(`[Test] Episodes for "${showTitle}" (${podcastId}):`);
  const episodes = json?.ModuleList?.modules?.[0]?.podcast?.episodes ?? [];
  episodes.forEach((ep: any) => {
    console.log(`- ${ep.title} (${ep.publishDate || ep.datePublished}) id=${ep.id}`);
  });
}

fetchPodcastEpisodes(knownShowID).catch(console.error);
