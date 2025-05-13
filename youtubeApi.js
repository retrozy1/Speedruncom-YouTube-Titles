import { google } from 'googleapis';

export const setTitle = async (id, title) => {
    const authClient = new google.auth.OAuth2({
        clientId: process.env.clientId,
        clientSecret: process.env.clientSecret
    });

    authClient.setCredentials({
        refresh_token: process.env.refresh_token
    });

    const youtube = google.youtube({
        auth: authClient,
        version: 'v3'
    });

    const videoData = await youtube.videos.list({
        id,
        part: 'snippet'
    });

    const { snippet } = videoData.data.items[0];

    snippet.title = title;

    try {
        await youtube.videos.update({
            part: 'snippet',
            requestBody: {
                id,
                snippet
            }
        });
    } catch (err) {
        console.error('API error:', err.message || err);
        process.exit(1);
    }
};

export const videoIsMine = async (videoId) => {
    const authClient = new google.auth.OAuth2({
        clientId: process.env.clientId,
        clientSecret: process.env.clientSecret
    });

    authClient.setCredentials({
        refresh_token: process.env.refresh_token
    });

    const youtube = google.youtube({
        auth: authClient,
        version: 'v3'
    });

    let videoData;
    try {
        videoData = await youtube.videos.list({
            id: videoId,
            part: 'snippet'
        });
    } catch (err) {
        console.error('API error:', err.message || err);
        process.exit(1);
    }

    return videoData.data.items[0]?.snippet.channelId === 'UCwTzKBHy-PJ5bi8n7yr0Q7g';
};