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
  const botConfig = config["bot-accounts"][botIndex];
  
  const bot = mineflayer.createBot({
    username: botConfig.username,
    password: botConfig.password,
    auth: botConfig.type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  bot.once('spawn', () => {
    console.log(`\x1b[33m[Bot ${botConfig.username}] Joined the server\x1b[0m`);

    if (config.utils["auto-auth"].enabled) {
      console.log(`[INFO] [Bot ${botConfig.username}] Auto-auth enabled`);
      setTimeout(() => {
        bot.chat(`/register ${config.utils["auto-auth"].password} ${config.utils["auto-auth"].password}`);
        bot.chat(`/login ${config.utils["auto-auth"].password}`);
      }, 500);
    }

    if (config.utils["chat-messages"].enabled) {
      console.log(`[INFO] [Bot ${botConfig.username}] Chat module enabled`);
      let messages = config.utils["chat-messages"].messages;
      if (config.utils["chat-messages"].repeat) {
        let delay = config.utils["chat-messages"]["repeat-delay"] * 1000;
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
      console.log(`\x1b[32m[Bot ${botConfig.username}] Moving to (${config.position.x}, ${config.position.y}, ${config.position.z})\x1b[0m`);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
    }

    if (config.utils["anti-afk"].enabled) {
      bot.setControlState("jump", true);
      if (config.utils["anti-afk"].sneak) bot.setControlState("sneak", true);
    }

    if (config.utils["auto-rejoin"].enabled) {
      setTimeout(() => {
        console.log(`\x1b[33m[Bot ${botConfig.username}] Leaving server for rejoin...\x1b[0m`);
        bot.quit();
      }, config.utils["auto-rejoin"].leaveAfter * 1000);
    }
  });

  bot.on("goal_reached", () => {
    console.log(`\x1b[32m[Bot ${botConfig.username}] Reached target location.\x1b[0m`);
  });

  bot.on("death", () => {
    console.log(`\x1b[33m[Bot ${botConfig.username}] Died and respawned.\x1b[0m`);
  });

  bot.on("end", () => {
    if (config.utils["auto-rejoin"].enabled) {
      setTimeout(() => createBot(botIndex), config.utils["auto-rejoin"].rejoinAfter * 1000);
    }
  });

  bot.on("kicked", (reason) => console.log(`\x1b[33m[Bot ${botConfig.username}] Kicked: ${reason}\x1b[0m`));
  bot.on("error", (err) => console.log(`\x1b[31m[ERROR] [Bot ${botConfig.username}] ${err.message}\x1b[0m`));
}

// Start both bots with staggered join/leave times
createBot(0);
setTimeout(() => createBot(1), config.utils["auto-rejoin"].leaveAfter * 500);
