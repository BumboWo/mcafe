const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const express = require('express');

const app = express();
app.use(express.json());

const activeSessions = {}; // key: ip:port => [ { botInstance, botData, meta } ]

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
  if (activeSessions[key]) {
    return res.send(`Bots already running on ${key}`);
  }

  console.log(`\n[DISPATCH] Spawning ${bots.length} bots to ${key}`);
  activeSessions[key] = [];

  bots.forEach((botData, index) => {
    startBotSession(ip, port, version, botData, key, index);
  });

  res.send(`Dispatched ${bots.length} bots to ${key}`);
});

function startBotSession(ip, port, version, botData, key, index) {
  const username = botData.username || `Bot_${index}_${Date.now()}`;
  const session = { botInstance: null, botData, meta: { reconnecting: false, key, index, username, version, ip, port } };
  activeSessions[key].push(session);
  spawnBot(session);
}

function spawnBot(session) {
  const { ip, port, version, username, index, key } = session.meta;
  const botData = session.botData;

  console.log(`\n[INIT] Spawning Bot ${index + 1} (${username}) on ${key}`);

  const bot = mineflayer.createBot({
    username,
    auth: botData.auth || 'offline',
    host: ip,
    port,
    version
  });

  session.botInstance = bot;
  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`\x1b[32m[Bot ${index + 1}] Spawned (${username}) on ${key}\x1b[0m`);

    let mcData;
    try {
      mcData = mcDataLoader(bot.version);
    } catch (e) {
      console.error(`[FATAL] minecraft-data load failed for ${bot.version}: ${e.message}`);
      return;
    }

    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    if (botData.goalPosition) {
      const { x, y, z } = botData.goalPosition;
      bot.pathfinder.setGoal(new GoalBlock(x, y, z));
    }

    if (Array.isArray(botData.commands)) {
      const loop = botData.loop ?? true;
      const runCommands = async () => {
        for (const cmd of botData.commands) {
          if (cmd.delay) await wait(cmd.delay * 1000);
          if (cmd.text) bot.chat(cmd.text);
        }
        if (loop) runCommands();
      };
      runCommands();
    }

    if (botData.antiAfk?.enabled) {
      if (botData.antiAfk.jump) bot.setControlState('jump', true);
      if (botData.antiAfk.sneak) bot.setControlState('sneak', true);
    }

    if (Array.isArray(botData.snippets)) {
      botData.snippets.forEach(snippet => {
        if (snippet.type === 'autoRestart') {
          const interval = (snippet.intervalMinutes || 30) * 60000;
          setInterval(async () => {
            bot.chat(snippet.warningMessage || '/say Restarting soon...');
            await wait(10000);
            bot.chat(snippet.restartCommand || '/restart');
          }, interval);
        }
      });
    }

    if (botData.heartbeat?.command) {
      const interval = (botData.heartbeat.intervalSeconds || 60) * 1000;
      const sendHeartbeat = () => {
        bot.chat(botData.heartbeat.command);
        console.log(`[Heartbeat] ${username}: ${botData.heartbeat.command}`);
      };
      sendHeartbeat();
      const hbInterval = setInterval(sendHeartbeat, interval);
      bot.once('end', () => clearInterval(hbInterval));
    }
  });

  bot.on('goal_reached', () => {
    console.log(`\x1b[34m[Bot ${index + 1}] Reached goal on ${key}\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[Bot ${index + 1}] Died on ${key}\x1b[0m`);
  });

  bot.on('kicked', reason => {
    const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason);
    console.warn(`\x1b[33m[Bot ${index + 1}] Kicked from ${key}: ${reasonStr}\x1b[0m`);

    if (reasonStr.toLowerCase().includes("hammered")) {
      console.log(`[Bot ${index + 1}] Terminated due to 'hammered' kick reason.`);
      destroySession(key, bot);
    } else {
      scheduleReconnect(session);
    }
  });

  bot.on('end', () => {
    console.log(`\x1b[31m[Bot ${index + 1}] Disconnected from ${key}\x1b[0m`);
    scheduleReconnect(session);
  });

  bot.on('error', err => {
    console.error(`\x1b[31m[Bot ${index + 1}] Error: ${err.message}\x1b[0m`);
  });
}

function scheduleReconnect(session) {
  if (session.meta.reconnecting) return;
  session.meta.reconnecting = true;

  const { key, botInstance } = session;
  destroySession(key, botInstance);

  console.log(`[RECONNECT] Scheduling reconnect for Bot ${session.meta.index + 1}...`);
  setTimeout(() => {
    session.meta.reconnecting = false;
    spawnBot(session);
  }, 5000);
}

function destroySession(key, botInstance) {
  if (!activeSessions[key]) return;
  activeSessions[key] = activeSessions[key].filter(s => s.botInstance !== botInstance);
  if (activeSessions[key].length === 0) delete activeSessions[key];
  botInstance.removeAllListeners();
}

app.listen(8000, () => console.log('Server started on port 8000'));
