import { google, type youtube_v3 } from 'googleapis';

const authClient = new google.auth.OAuth2({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET
});

authClient.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN
});

const youtube = google.youtube({
  auth: authClient,
  version: 'v3'
});

export const getVideo = async (id: string) => {
  const videoData = await youtube.videos.list({
    id: [id],
    part: ["snippet"]
  });
  return videoData.data.items?.[0]?.snippet;
};

export const updateVideo = async (id: string, snippet: youtube_v3.Schema$VideoSnippet) => {
  await youtube.videos.update({
    requestBody: {
      id,
      snippet
    }
  });
};