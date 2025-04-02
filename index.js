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
      console.log(`\x1b[33m[Bot ${botIndex + 1}] Joined the server\x1b[0m`);

      if (config.utils['auto-auth'].enabled) {
         console.log(`[INFO] [Bot ${botIndex + 1}] Started auto-auth module`);
         setTimeout(() => {
            bot.chat(`/register ${config.utils['auto-auth'].password} ${config.utils['auto-auth'].password}`);
            bot.chat(`/login ${config.utils['auto-auth'].password}`);
         }, 500);
      }

      if (config.utils['chat-messages'].enabled) {
         console.log(`[INFO] [Bot ${botIndex + 1}] Started chat-messages module`);
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
         console.log(`\x1b[32m[Bot ${botIndex + 1}] Moving to (${config.position.x}, ${config.position.y}, ${config.position.z})\x1b[0m`);
         bot.pathfinder.setMovements(defaultMove);
         bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
      }

      if (config.utils['anti-afk'].enabled) {
         bot.setControlState('jump', true);
         if (config.utils['anti-afk'].sneak) bot.setControlState('sneak', true);
      }
   });

   bot.on('goal_reached', () => {
      console.log(`\x1b[32m[Bot ${botIndex + 1}] Reached target location.\x1b[0m`);
   });

   bot.on('death', () => {
      console.log(`\x1b[33m[Bot ${botIndex + 1}] Bot died and respawned.\x1b[0m`);
   });

   bot.on('end', () => {
      console.log(`\x1b[31m[Bot ${botIndex + 1}] Disconnected! Reconnecting...\x1b[0m`);
      setTimeout(() => createBot(botIndex), config.utils['auto-reconnect-delay']);
   });

   bot.on('kicked', (reason) => console.log(`\x1b[33m[Bot ${botIndex + 1}] Kicked: ${reason}\x1b[0m`));
   bot.on('error', (err) => console.log(`\x1b[31m[ERROR] [Bot ${botIndex + 1}] ${err.message}\x1b[0m`));
}

// Start both bots
createBot(0);
createBot(1);
