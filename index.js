const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const express = require('express');
const app = express();
const config = require('./settings.json');

app.get('/', (req, res) => {
  res.send('Bot dispatcher server is running');
});

const activeBots = {}; // Map IP -> [bot1, bot2]

app.get('/dispatch', (req, res) => {
  const ip = req.query.ip;
  const port = parseInt(req.query.port) || 25565;

  if (!ip) return res.status(400).send('Missing IP address');

  const key = `${ip}:${port}`;
  if (activeBots[key]) {
    return res.status(200).send(`Bots already connected to ${key}`);
  }

  activeBots[key] = [];

  // Launch two bots
  for (let i = 0; i < 2; i++) {
    const botIndex = i;
    const botConfig = config["bot-accounts"][botIndex];

    const bot = mineflayer.createBot({
      username: botConfig.username,
      password: botConfig.password,
      auth: botConfig.type,
      host: ip,
      port: port,
      version: config.server.version,
    });

    activeBots[key].push(bot);

    bot.loadPlugin(pathfinder);
    const mcData = mcDataLoader(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.settings.colorsEnabled = false;

    bot.once('spawn', () => {
      console.log(`\x1b[33m[Bot ${botIndex + 1}] Joined ${key}\x1b[0m`);

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

      if (config.position.enabled) {
        bot.pathfinder.setMovements(defaultMove);
        bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
      }

      if (config.utils['anti-afk'].enabled) {
        bot.setControlState('jump', true);
        if (config.utils['anti-afk'].sneak) bot.setControlState('sneak', true);
      }
    });

    bot.on('goal_reached', () => {
      console.log(`\x1b[32m[Bot ${botIndex + 1}] Reached goal on ${key}.\x1b[0m`);
    });

    bot.on('death', () => {
      console.log(`\x1b[33m[Bot ${botIndex + 1}] Died on ${key}.\x1b[0m`);
    });

    bot.on('end', () => {
      console.log(`\x1b[31m[Bot ${botIndex + 1}] Disconnected from ${key}. Reconnecting...\x1b[0m`);
      setTimeout(() => {
        activeBots[key].splice(botIndex, 1); // Remove dead bot
        createBotForTarget(ip, port, botIndex, key); // Recreate
      }, config.utils['auto-reconnect-delay']);
    });

    bot.on('kicked', reason => console.log(`\x1b[33m[Bot ${botIndex + 1}] Kicked from ${key}: ${reason}\x1b[0m`));
    bot.on('error', err => console.log(`\x1b[31m[ERROR] [Bot ${botIndex + 1}] ${err.message}\x1b[0m`));
  }

  res.send(`Dispatched 2 bots to ${key}`);
});

app.listen(8000, () => {
  console.log('Dispatcher server started on port 8000');
});
