import { getVideo, updateVideo } from './youtubeApi.js';
import fs from 'fs/promises';
import { execSync } from 'child_process';

const CHANNEL_ID = 'UCwTzKBHy-PJ5bi8n7yr0Q7g';
const USER_ID = 'jm7ldezj';

let titleHistory = {};
let changedTitles = [];

const data = await fs.readFile('titles.json', 'utf-8');
titleHistory = JSON.parse(data);

const ordinalSuffix = (n) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'TH';

  const mod10 = n % 10;
  if (mod10 === 1) return 'ST';
  if (mod10 === 2) return 'ND';
  if (mod10 === 3) return 'RD';
  return 'TH';
}

const formatTime = (rawSeconds, alwaysShowMs = false) => {
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

const { categories, games, levels, players, runs, values, variables } = await fetch(`https://www.speedrun.com/api/v2/GetUserLeaderboard?userId=${USER_ID}`).then(x => x.json());

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

    let { name: game, url: gameUrl } = games.find(x => x.id === gameId);

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
    for (const playerId of playerIds.filter(x => x !== USER_ID)) {
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
        for (const url of videoUrls) {
            let snippet = await getVideo(videoToId(url));
            if (snippet?.channelId === CHANNEL_ID) {
                console.log(`Setting ${videoToId(url)} to "${title}"...`);

                snippet.title = title;
                if (!titleHistory[id]) {
                    if (snippet.description !== '') snippet.description = '\n\n';
                    snippet.description += `Run on Speedrun.com: https://www.speedrun.com/${gameUrl}/runs/${id}`;
                }

                await updateVideo(videoToId(url), snippet);
                console.log('Done.');
                changedTitles.push(id);
                titleHistory[id] = title;
                break;
            }
        }
    }
}

if (changedTitles.length) {
    await fs.writeFile('titles.json', JSON.stringify(titleHistory, null, 2));

    execSync('git config user.name "github-actions[bot]"');
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
    execSync('git add titles.json');
    execSync(`git commit -m "Added/changed ${changedTitles.join(', ')}"`);
    execSync('git push');
    console.log('Changes pushed successfully');
} else {
    console.log('No titles changed.')
}