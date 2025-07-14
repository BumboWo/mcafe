const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const express = require('express');

const app = express();
app.use(express.json());

const activeBots = {};       // key: "ip:port" => array of active bots
const reconnectFlags = {};   // key: "ip:port" => { [index]: boolean }

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
  reconnectFlags[key] = {};

  bots.forEach((botData, i) => spawnBot(ip, port, version, botData, key, i));
  res.send(`Dispatched ${bots.length} bots to ${key}`);
});

function spawnBot(ip, port, version, botData, key, index) {
  if (reconnectFlags[key]?.[index]) {
    console.log(`[Bot ${index + 1}] Reconnect already in progress for ${key}, skipping.`);
    return;
  }
  reconnectFlags[key][index] = true;

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
    reconnectFlags[key][index] = false;

    let mcData;
    try {
      mcData = mcDataLoader(bot.version);
    } catch (e) {
      console.error(`[FATAL] minecraft-data failed for version ${bot.version}: ${e.message}`);
      return;
    }

    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    if (botData.goalPosition) {
      const { x, y, z } = botData.goalPosition;
      bot.pathfinder.setGoal(new GoalBlock(x, y, z));
    }

    // Command loop
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
    console.log(`\x1b[31m[Bot ${index + 1}] Disconnected from ${key}. Reconnecting...\x1b[0m`);
    reconnectAndCleanup();
  });

  bot.on('kicked', reason => {
    const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason);
    console.warn(`\x1b[33m[Bot ${index + 1}] Kicked: ${reasonStr}\x1b[0m`);

    if (reasonStr.toLowerCase().includes("hammered")) {
      console.log(`\x1b[31m[Bot ${index + 1}] Kick reason matched "hammered". Terminating session.\x1b[0m`);
      cleanupBot(bot, key, index);
      return;
    }

    reconnectAndCleanup();
  });

  bot.on('error', err => {
    console.error(`\x1b[31m[Bot ${index + 1}] Error: ${err.message}\x1b[0m`);
  });

  function reconnectAndCleanup() {
    activeBots[key] = activeBots[key].filter(b => b !== bot);
    if (activeBots[key].length === 0) {
      delete activeBots[key];
      delete reconnectFlags[key];
    }
    setTimeout(() => spawnBot(ip, port, version, botData, key, index), 5000);
  }

  function cleanupBot(botInstance, key, index) {
    activeBots[key] = activeBots[key].filter(b => b !== botInstance);
    delete reconnectFlags[key][index];
    if (activeBots[key].length === 0) {
      delete activeBots[key];
      delete reconnectFlags[key];
    }
    botInstance.removeAllListeners();
  }
}

app.listen(8000, () => console.log('Server started on port 8000'));
