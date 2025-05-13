import { setTitle, videoIsMine } from './youtubeApi.js';
import fs from 'fs/promises';
/*
import dotenv from 'dotenv';
dotenv.config();
*/

let titleHistory = {};
try {
  const data = await fs.readFile('titles.json', 'utf-8');
  titleHistory = JSON.parse(data);
} catch (e) {
  if (e.code !== 'ENOENT') throw e; // Ignore if file doesn't exist
}

function ordinalSuffix(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'TH';

  const mod10 = n % 10;
  if (mod10 === 1) return 'ST';
  if (mod10 === 2) return 'ND';
  if (mod10 === 3) return 'RD';
  return 'TH';
}

function formatTime(rawSeconds, alwaysShowMs = false) {
  const totalMs = Math.floor(rawSeconds * 1000);
  const hours = Math.floor(totalMs / (3600 * 1000));
  const minutes = Math.floor((totalMs % (3600 * 1000)) / (60 * 1000));
  const seconds = Math.floor((totalMs % (60 * 1000)) / 1000);
  const milliseconds = totalMs % 1000;

  const msString = milliseconds.toString().padStart(3, '0');
  const showMs = milliseconds !== 0 || alwaysShowMs;

  let timeString = '';

  if (hours > 0) {
    timeString += `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else if (minutes > 0) {
    timeString += `${minutes}:${seconds.toString().padStart(2, '0')}`;
  } else {
    timeString += `${seconds}`;
  }

  if (showMs) {
    timeString += `.${msString}`;
  } else {
    timeString += 's';
  }

  return timeString;
}

const videoToId = (url) => {
    if (url.includes('youtube.com')) {
        return new URL(url).searchParams.get('v');        
    }
    return url.split('/')[3].split('?')[0];
};

const { categories, games, levels, players, runs, values, variables } = await fetch('https://www.speedrun.com/api/v2/GetUserLeaderboard?userId=jm7ldezj').then(x => x.json());

runs.slice(2);

for (const { video, comment, place, gameId, categoryId, levelId, valueIds, playerIds, time, igt, id } of runs) {

    let rank;
    if (place) {
        if (place === 1) {
            rank = 'WR';
        } else {
            rank = `${place}${ordinalSuffix(place)} PLACE`;
        }
    } else {
        rank = 'OBSOLETE';
    }

    let { name: game, url } = games.find(x => x.id === gameId);

    let category;
    const { name: categoryName, enforceMs } = categories.find(x => x.id === categoryId);
    if (levelId) {
        const levelCategories = categories.filter(cat => cat.gameId === gameId && cat.isPerLevel && !cat.archived);
        const level = levels.find(lvl => lvl.id === levelId);

        category = level.name;
        if (levelCategories.length > 1) category += ` ${categoryName}`;
    } else {
        category = categoryName;
    }

    let subcategories = [];
    let annotations = [];
    
    let valueList = [];
    for (const valueId of valueIds) {
        const value = values.find(x => x.id === valueId);
        const variable = variables.find(x => x.id === value.variableId);
        valueList.push({
            value,
            variable
        });
    }

    valueList.sort((a, b) => a.variable.pos - b.variable.pos);

    for (const { value, variable } of valueList.filter(x => !x.value.archived && !x.variable.archived)) {
        if (variable.isSubcategory) {
            subcategories.push(value.name);
        } else {
            annotations.push(value.name);
        }
    }

    let runners = [];
    for (const playerId of playerIds.filter(x => x !== 'jm7ldezj')) {
        runners.push(players.find(x => x.id === playerId).name);
    }

    let title;

    const buildTitle = () => {
        title = `[${rank}] ${game} ${category} ${subcategories.join(', ')} `;
        if (annotations.length) title += `(${annotations.join(', ')}) `;
        if (runners.length) title += `with ${runners.join(', ')} `;
        title += `in ${formatTime(time || igt, enforceMs)}`;
        title = title.replace(/ {2,}/g, ' ');
    };
    buildTitle();

    const steps = [
        () => { runners = []; },
        () => { annotations = []; },
        () => { game = ''; },
        () => { category = ''; },
        () => { subcategories = []; }
    ];

    for (const reduce of steps) {
        if (title.length <= 100) break;
        reduce();
        buildTitle();
    }

    if (titleHistory[id] !== title) {
        const videoUrls = (video + ' ' + (comment || '')).split(/\s+/).filter(x => x.slice(0, 4) === 'http');
        let videoId;
        for (const url of videoUrls) {
            if (await videoIsMine(videoToId(url))) {
                videoId = videoToId(url);
                break;
            }
        }
        if (!videoId) continue;

        console.log(`Setting ${videoId} to "${title}"...`);

        try {
            await setTitle(videoId, title);
            console.log('Done.');
            titleHistory[id] = title;
        } catch (err) {
            if (err.code === 403 || err.response?.status === 403) {
                console.warn(`Rate limit hit for ${videoId}: ${err.message}`);
            } else {
                throw err;
            }
        } finally {
            await fs.writeFile('titles.json', JSON.stringify(titleHistory, null, 2));
        }
    }
}