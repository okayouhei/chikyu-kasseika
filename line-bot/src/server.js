import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createLineClient, verifySignature } from './line.js';
import { createClaude } from './claude.js';
import { createHandler } from './commands.js';
import { tick } from './scheduler.js';

export function createApp({ config, db, line, handler }) {
  async function dispatch(ev) {
    let out = null;
    if (ev.type === 'message' && ev.message.type === 'text') {
      out = await handler.onText({ source: ev.source, userId: ev.source.userId, text: ev.message.text, mention: ev.message.mention });
    } else if (ev.type === 'postback') {
      out = await handler.onPostback({ source: ev.source, userId: ev.source.userId, data: ev.postback.data });
    } else if (ev.type === 'join' || ev.type === 'follow') {
      out = handler.onJoin();
    }
    if (out && ev.replyToken) await line.reply(ev.replyToken, out);
  }

  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') { res.end('ok'); return; }
    if (req.method !== 'POST' || req.url !== '/webhook') { res.statusCode = 404; res.end(); return; }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      if (!verifySignature(raw, req.headers['x-line-signature'], config.channelSecret)) {
        res.statusCode = 401; res.end('invalid signature'); return;
      }
      res.end('OK'); // LINEには先に200を返し、処理は非同期で行う
      let body;
      try { body = JSON.parse(raw.toString('utf8')); } catch { return; }
      for (const ev of body.events || []) dispatch(ev).catch((e) => console.error('event error', e));
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  if (!config.channelSecret || !config.channelAccessToken) {
    console.error('LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN を設定してください'); process.exit(1);
  }
  const db = openDb(config.dbPath);
  const line = createLineClient({ channelAccessToken: config.channelAccessToken });
  const claude = createClaude({ apiKey: config.anthropicApiKey, model: config.claudeModel });
  const handler = createHandler({ db, line, claude, retentionDays: config.retentionDays });
  createApp({ config, db, line, handler }).listen(config.port, () => console.log(`listening on :${config.port}`));

  let busy = false;
  setInterval(async () => {
    if (busy) return; busy = true;
    try { await tick({ db, line, handler }); handler.purge(); } catch (e) { console.error('tick error', e); } finally { busy = false; }
  }, 60_000);
}
