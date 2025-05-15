import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

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

export const getVideo = async (id) => {
    const videoData = await youtube.videos.list({
        id,
        part: 'snippet'
    });
    return videoData.data.items[0]?.snippet;
};

export const updateVideo = async (id, snippet) => {
    await youtube.videos.update({
            part: 'snippet',
            requestBody: {
                id,
                snippet
            }
    });
};