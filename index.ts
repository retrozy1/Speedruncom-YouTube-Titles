import { getVideo, updateVideo } from './youtubeApi.js';
import fs from 'node:fs/promises';
import { $ } from 'bun';
import Client, { type Value, type Variable } from 'speedruncom.js'

const CHANNEL_ID = 'UCwTzKBHy-PJ5bi8n7yr0Q7g';
const USER_ID = 'jm7ldezj';

let titleHistory: Record<string, string> = {};
let modifiedTitles = 0;
let addedTitles = 0;

const data = await fs.readFile('titles.json', 'utf-8');
titleHistory = JSON.parse(data);

const ordinalSuffix = (n: number) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'TH';

  const mod10 = n % 10;
  if (mod10 === 1) return 'ST';
  if (mod10 === 2) return 'ND';
  if (mod10 === 3) return 'RD';
  return 'TH';
}

const formatTime = (rawSeconds: number, alwaysShowMs = false) => {
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

const videoToId = (url: string) => {
  let videoId: string;
  if (url.includes('youtube.com')) {
    const id = new URL(url).searchParams.get('v');
    if (id === null) throw new Error("The search paramater was not found.")
    videoId = id;
  }
  videoId = url.split('/')[3].split('?')[0];

  return videoId.replaceAll(",", "")
};

const client = new Client();

const { categories, games, levels, players, runs, values, variables } = (await client.get("GetUserLeaderboard", { userId: USER_ID })).data;

for (const run of runs) {
  let rank: string;
  if (run.place) {
    if (run.place === 1) {
      rank = 'WR';
    } else {
      rank = `${run.place}${ordinalSuffix(run.place)} PLACE`;
    }
  } else {
    rank = 'OBSOLETE';
  }

  let { name: game, url: gameUrl } = games.find(x => x.id === run.gameId)!;

  let categoryText: string;
  const { name: categoryName, enforceMs } = categories.find(x => x.id === run.categoryId)!;
  if (run.levelId) {
    const levelCategories = categories.filter(cat => cat.gameId === run.gameId && cat.isPerLevel && !cat.archived);
    const level = levels.find(lvl => lvl.id === run.levelId)!;

    categoryText = level.name;
    if (levelCategories.length > 1) categoryText += ` ${categoryName}`;
  } else {
    categoryText = categoryName;
  }

  let subcategories: string[] = [];
  let annotations: string[] = [];

  let valueList: { value: Value, variable: Variable }[] = [];
  for (const valueId of run.valueIds) {
    const value = values.find(x => x.id === valueId)!;
    valueList.push({
      value,
      variable: variables.find(x => x.id === value.variableId)!
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

  let runners: string[] = [];
  for (const playerId of run.playerIds.filter(x => x !== USER_ID)) {
    runners.push(players.find(x => x.id === playerId)!.name);
  }

  let title = "";

  const buildTitle = () => {
    title = `[${rank}] ${game} ${categoryText} ${subcategories.join(', ')} `;
    if (annotations.length) title += `(${annotations.join(', ')}) `;
    if (runners.length) title += `with ${runners.join(', ')} `;
    title += `in ${formatTime((run.time ?? run.igt)!, enforceMs)}`;
    title = title.replace(/ {2,}/g, ' ');
  };
  buildTitle();

  const steps = [
    () => { runners = []; },
    () => { annotations = []; },
    () => { game = ''; },
    () => { categoryText = ''; },
    () => { subcategories = []; }
  ];

  for (const reduce of steps) {
    if (title.length <= 100) break;
    reduce();
    buildTitle();
  }

  if (titleHistory[run.id] !== title) {
    let runText = '';
    if (run.video) runText += run.video
    if (run.comment) runText += ` ${run.comment}`;

    const videoUrls = runText.split(/\s+/).filter(x => x.startsWith("http"));
    for (const url of videoUrls) {
      let snippet = await getVideo(videoToId(url));
      if (snippet?.channelId !== CHANNEL_ID) continue;
      
      console.log(`Setting ${videoToId(url)} to "${title}"...`);

      snippet.title = title;
      if (titleHistory[run.id]) {
        if (snippet.description !== '') snippet.description = '\n\n';
        snippet.description += `Run on Speedrun.com: https://www.speedrun.com/${gameUrl}/runs/${run.id}`;
        modifiedTitles++;
      } else {
        addedTitles++;
      }

      await updateVideo(videoToId(url), snippet);
      console.log('Done.');
      titleHistory[run.id] = title;
      break;
    }
  }
}

if (modifiedTitles > 0 || addedTitles > 0) {
  let message = "";
  if (addedTitles > 0) {
    message += `Added ${addedTitles} title${addedTitles !== 1 && 's'}`;
    if (modifiedTitles > 0) {
      message += `and modified ${modifiedTitles} title${modifiedTitles !== 1 ? 's' : ''}`
    }
  } else {
    message += `Modified ${modifiedTitles} title${modifiedTitles !== 1 ? 's': ''}`;
  }

  await fs.writeFile('titles.json', JSON.stringify(titleHistory, null, 2));

  await $`git config user.name "github-actions[bot]"`;
  await $`git config user.email "github-actions[bot]@users.noreply.github.com"`;
  await $`git add titles.json`;
  await $`git commit -m "${message}"`;
  await $`git push`;
  console.log('Changes pushed successfully');
} else {
  console.log('No titles changed.')
}