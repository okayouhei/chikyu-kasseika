import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.line.me/v2/bot';

export function verifySignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** 長文を LINE の1通5000文字制限に合わせて最大5通に分割 */
export function toMessages(items) {
  const out = [];
  for (const it of items) {
    if (typeof it !== 'string') { out.push(it); continue; }
    for (let i = 0; i < it.length; i += 4900) out.push({ type: 'text', text: it.slice(i, i + 4900) });
  }
  return out.slice(0, 5);
}

export function createLineClient({ channelAccessToken, fetchImpl = fetch }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` };
  const post = async (path, body) => {
    const res = await fetchImpl(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) console.error(`LINE API ${path} failed: ${res.status} ${await res.text()}`);
    return res.ok;
  };
  const nameCache = new Map();
  return {
    reply: (replyToken, items) => post('/message/reply', { replyToken, messages: toMessages(items) }),
    push: (to, items) => post('/message/push', { to, messages: toMessages(items) }),
    async getName(source, userId) {
      if (!userId) return 'メンバー';
      const key = `${source.type}:${source.groupId || source.roomId || ''}:${userId}`;
      if (nameCache.has(key)) return nameCache.get(key);
      const path = source.type === 'group' ? `/group/${source.groupId}/member/${userId}`
        : source.type === 'room' ? `/room/${source.roomId}/member/${userId}` : `/profile/${userId}`;
      try {
        const res = await fetchImpl(`${API}${path}`, { headers });
        const name = res.ok ? (await res.json()).displayName : 'メンバー';
        nameCache.set(key, name);
        return name;
      } catch { return 'メンバー'; }
    },
  };
}
