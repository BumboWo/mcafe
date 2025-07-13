const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const express = require('express');
const config = require('./settings.json');
const app = express();

process.on('uncaughtException', err => {
  console.error('[FATAL ERROR]', err);
});
process.on('unhandledRejection', err => {
  console.error('[UNHANDLED PROMISE]', err);
});

const activeBots = {}; // ip:port => [bots]

app.get('/', (req, res) => {
  res.send('Bot dispatcher running.');
});

app.get('/dispatch', async (req, res) => {
  const ip = req.query.ip;
  const port = parseInt(req.query.port) || 25565;
  const key = `${ip}:${port}`;

  if (!ip) return res.status(400).send('Missing ?ip= parameter.');
  if (activeBots[key]) return res.send(`Bots already running on ${key}`);

  console.log(`[DISPATCH] Spawning 2 bots to ${key}`);
  activeBots[key] = [];

  for (let i = 0; i < 2; i++) {
    if (!config['bot-accounts'][i]) {
      console.warn(`[WARN] No bot config for index ${i}. Skipping.`);
      continue;
    }

    spawnBot(ip, port, i, key);
  }

  res.send(`Dispatched 2 bots to ${key}`);
});

function spawnBot(ip, port, botIndex, key) {
  const botConfig = config["bot-accounts"][botIndex];
  const version = config.server.version || false;

  console.log(`\n[INIT] Starting Bot ${botIndex + 1}`);
  console.log(`- Username: ${botConfig.username}`);
  console.log(`- Server: ${ip}:${port}`);
  console.log(`- Requested Version: ${version}\n`);

  const bot = mineflayer.createBot({
    username: botConfig.username,
    password: botConfig.password,
    auth: botConfig.type,
    host: ip,
    port,
    version,
  });

  activeBots[key].push(bot);

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`\x1b[32m[Bot ${botIndex + 1}] Spawned successfully on ${key}\x1b[0m`);
    console.log(`- Detected Minecraft Version: ${bot.version}`);
    try {
      const mcData = mcDataLoader(bot.version);
      console.log(`- Protocol Version: ${mcData.version?.version || 'unknown'}`);
      const defaultMove = new Movements(bot, mcData);
      bot.pathfinder.setMovements(defaultMove);

      if (config.position.enabled) {
        bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
      }
    } catch (err) {
      console.error(`[FATAL] Failed to load minecraft-data for version ${bot.version}:`, err.message);
    }

    if (config.utils['auto-auth'].enabled) {
      setTimeout(() => {
        bot.chat(`/register ${config.utils['auto-auth'].password} ${config.utils['auto-auth'].password}`);
        bot.chat(`/login ${config.utils['auto-auth'].password}`);
      }, 500);
    }

    if (config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages'].messages;
      const delay = config.utils['chat-messages']['repeat-delay'] * 1000;
      if (config.utils['chat-messages'].repeat) {
        let i = 0;
        setInterval(() => {
          bot.chat(messages[i]);
          i = (i + 1) % messages.length;
        }, delay);
      } else {
        messages.forEach(msg => bot.chat(msg));
      }
    }

    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) bot.setControlState('sneak', true);
    }
  });

  bot.on('goal_reached', () => {
    console.log(`\x1b[32m[Bot ${botIndex + 1}] Reached goal on ${key}\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[Bot ${botIndex + 1}] Died on ${key}\x1b[0m`);
  });

  bot.on('end', () => {
    console.log(`\x1b[31m[Bot ${botIndex + 1}] Disconnected from ${key}. Reconnecting...\x1b[0m`);
    setTimeout(() => spawnBot(ip, port, botIndex, key), config.utils['auto-reconnect-delay']);
  });

  bot.on('kicked', reason => {
    console.warn(`\x1b[33m[Bot ${botIndex + 1}] Kicked from ${key}: ${reason}\x1b[0m`);
  });

  bot.on('error', err => {
    console.error(`\x1b[31m[ERROR] [Bot ${botIndex + 1}] ${err.message}\x1b[0m`);
  });

  // Low-level protocol errors
  bot._client.on('error', (err) => {
    console.error(`\x1b[31m[PROTOCOL ERROR] Bot ${botIndex + 1}: ${err.message}\x1b[0m`);
  });

  bot._client.on('disconnect', (packet) => {
    console.warn(`\x1b[33m[PROTOCOL DISCONNECT] Bot ${botIndex + 1}:`, packet);
  });
}
