const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;
const config = require('./settings.json');
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bots are running');
});

app.listen(8000, () => {
  console.log('Server started on port 8000');
});

function createBot(botIndex) {
  const account = config["bot-accounts"][botIndex];

  const bot = mineflayer.createBot({
    username: account.username,
    password: account.password,
    auth: account.type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  bot.once('spawn', () => {
    console.log(`\x1b[33m[Bot ${botIndex + 1}] Joined the server\x1b[0m`);

    if (config.utils['auto-auth'].enabled) {
      setTimeout(() => {
        bot.chat(`/register ${config.utils['auto-auth'].password} ${config.utils['auto-auth'].password}`);
        bot.chat(`/login ${config.utils['auto-auth'].password}`);
      }, 500);
    }

    if (config.utils['chat-messages'].enabled) {
      let messages = config.utils['chat-messages'].messages;
      if (config.utils['chat-messages'].repeat) {
        let delay = config.utils['chat-messages']['repeat-delay'] * 1000;
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

    if (config.utils['auto-rejoin'].enabled) {
      setTimeout(() => {
        console.log(`\x1b[33m[Bot ${botIndex + 1}] Leaving server for rejoin...\x1b[0m`);
        bot.quit();
      }, config.utils['auto-rejoin'].leaveAfter * 1000);
    }
  });

  bot.on('goal_reached', () => {
    console.log(`\x1b[32m[Bot ${botIndex + 1}] Reached target location.\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[Bot ${botIndex + 1}] Died and respawned.\x1b[0m`);
  });

  bot.on('end', () => {
    if (config.utils['auto-rejoin'].enabled) {
      setTimeout(() => createBot(botIndex), config.utils['auto-rejoin'].rejoinAfter * 1000);
    }
  });

  bot.on('kicked', (reason) => console.log(`\x1b[33m[Bot ${botIndex + 1}] Kicked: ${reason}\x1b[0m`));
  bot.on('error', (err) => console.log(`\x1b[31m[ERROR] [Bot ${botIndex + 1}] ${err.message}\x1b[0m`));
}

// Start two bots with a delay to ensure they don’t leave and rejoin at the same time
createBot(0);
setTimeout(() => createBot(1), config.utils['auto-rejoin'].leaveAfter * 500);
