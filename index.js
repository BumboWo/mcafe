const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const express = require('express');

const app = express();
app.use(express.json());

const activeBots = {}; // key: ip:port => array of bots

process.on('uncaughtException', err => console.error('[FATAL]', err));
process.on('unhandledRejection', err => console.error('[UNHANDLED]', err));

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.get('/', (req, res) => res.send('Bot dispatcher is running.'));

app.post('/dispatch', async (req, res) => {
  const { ip, port = 25565, version = false, bots } = req.body;
  if (!ip || !Array.isArray(bots)) {
    return res.status(400).send('Missing required fields: ip, bots[]');
  }

  const key = `${ip}:${port}`;
  if (activeBots[key]) return res.send(`Bots already running on ${key}`);

  console.log(`\n[DISPATCH] Spawning ${bots.length} bots to ${key}`);
  activeBots[key] = [];

  bots.forEach((botData, i) => spawnBot(ip, port, version, botData, key, i));
  res.send(`Dispatched ${bots.length} bots to ${key}`);
});

function spawnBot(ip, port, version, botData, key, index) {
  const bot = mineflayer.createBot({
    username: botData.username || `Bot_${index}_${Date.now()}`,
    auth: botData.auth || 'offline',
    host: ip,
    port,
    version
  });

  activeBots[key].push(bot);
  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`\x1b[32m[Bot ${index + 1}] Spawned (${bot.username}) on ${key}\x1b[0m`);
    console.log(` - Minecraft version: ${bot.version}`);

    let mcData;
    try {
      mcData = mcDataLoader(bot.version);
    } catch (e) {
      console.error(`[FATAL] minecraft-data failed for version ${bot.version}: ${e.message}`);
      return;
    }

    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    // Movement goal
    if (botData.goalPosition) {
      const { x, y, z } = botData.goalPosition;
      bot.pathfinder.setGoal(new GoalBlock(x, y, z));
    }

    // Chat command loop
    if (Array.isArray(botData.commands) && botData.commands.length > 0) {
      const loop = botData.loop ?? true;
      const runCommands = async () => {
        for (let cmd of botData.commands) {
          if (cmd.delay) await wait(cmd.delay * 1000);
          if (cmd.text) bot.chat(cmd.text);
        }
        if (loop) runCommands();
      };
      runCommands();
    }

    // Anti-AFK
    if (botData.antiAfk?.enabled) {
      if (botData.antiAfk.jump) bot.setControlState('jump', true);
      if (botData.antiAfk.sneak) bot.setControlState('sneak', true);
    }

    // Snippets
    if (Array.isArray(botData.snippets)) {
      botData.snippets.forEach(snippet => {
        if (snippet.type === 'autoRestart') {
          const interval = (snippet.intervalMinutes || 30) * 60 * 1000;
          setInterval(async () => {
            bot.chat(snippet.warningMessage || '/say Restarting soon...');
            await wait(10000);
            bot.chat(snippet.restartCommand || '/restart');
          }, interval);
        }
      });
    }

    // Heartbeat
    if (botData.heartbeat?.command) {
      const interval = (botData.heartbeat.intervalSeconds || 60) * 1000;
      const sendChatHeartbeat = () => {
        bot.chat(botData.heartbeat.command);
        console.log(`[Heartbeat] (${bot.username}) Sent: ${botData.heartbeat.command}`);
      };
      sendChatHeartbeat();
      const hbInterval = setInterval(sendChatHeartbeat, interval);
      bot.once('end', () => clearInterval(hbInterval));
    }
  });

  bot.on('goal_reached', () => {
    console.log(`\x1b[34m[Bot ${index + 1}] Reached goal on ${key}\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[Bot ${index + 1}] Died on ${key}\x1b[0m`);
  });

  bot.on('end', () => {
    console.log(`\x1b[31m[Bot ${index + 1}] Disconnected. Reconnecting...\x1b[0m`);
    setTimeout(() => spawnBot(ip, port, version, botData, key, index), 5000);
  });

  bot.on('kicked', reason => {
    console.warn(`\x1b[33m[Bot ${index + 1}] Kicked: ${reason}\x1b[0m`);
  });

  bot.on('error', err => {
    console.error(`\x1b[31m[Bot ${index + 1}] Error: ${err.message}\x1b[0m`);
  });
}

app.listen(8000, () => console.log('Server started on port 8000'));
