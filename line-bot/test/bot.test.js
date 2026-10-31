import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseLeading, fromJst, formatJst } from '../src/datetime.js';
import { openDb } from '../src/db.js';
import { createHandler } from '../src/commands.js';
import { verifySignature, toMessages } from '../src/line.js';
import { tick } from '../src/scheduler.js';

const NOW = fromJst(2026, 10, 31, 12, 0);
const src = { type: 'group', groupId: 'G1', userId: 'U1' };

function setup(now = NOW) {
  const db = openDb(':memory:');
  const pushed = [];
  const line = { getName: async (_s, u) => (u === 'U2' ? 'B' : 'A'), push: async (to, m) => pushed.push([to, m]) };
  const asked = [];
  const claude = { enabled: true, ask: async (a) => (asked.push(a), 'AI応答') };
  const clock = { t: now };
  const handler = createHandler({ db, line, claude, now: () => clock.t });
  const say = (text, extra = {}) => handler.onText({ source: src, userId: extra.userId || 'U1', text, mention: extra.mention });
  return { db, handler, say, pushed, asked, line, clock };
}

test('parseLeading: 各形式', () => {
  assert.equal(parseLeading('11/1 14:40 ゆめフェス', NOW).ts, fromJst(2026, 11, 1, 14, 40));
  assert.equal(parseLeading('11/1 14:40 ゆめフェス', NOW).rest, 'ゆめフェス');
  assert.equal(parseLeading('２０２６/１２/３ １９：００', NOW).ts, fromJst(2026, 12, 3, 19, 0));
  assert.equal(parseLeading('11月5日 19時30分 会議', NOW).ts, fromJst(2026, 11, 5, 19, 30));
  assert.equal(parseLeading('明日 10:00', NOW).ts, fromJst(2026, 11, 1, 10, 0));
  assert.equal(parseLeading('1/5 10:00', NOW).ts, fromJst(2027, 1, 5, 10, 0)); // 年またぎ
  assert.equal(parseLeading('11/1', NOW), null); // 時刻なし
  assert.equal(parseLeading('こんにちは', NOW), null);
  // 2026/10/31 は土曜。水曜 → 11/4、来週水曜 → 11/11
  assert.equal(parseLeading('水曜 19:00', NOW).ts, fromJst(2026, 11, 4, 19, 0));
  assert.equal(parseLeading('来週水曜 19:00', NOW).ts, fromJst(2026, 11, 11, 19, 0));
});

test('署名検証', () => {
  const body = Buffer.from('{"events":[]}');
  const sig = createHmac('sha256', 'secret').update(body).digest('base64');
  assert.equal(verifySignature(body, sig, 'secret'), true);
  assert.equal(verifySignature(body, sig, 'other'), false);
  assert.equal(verifySignature(body, undefined, 'secret'), false);
  assert.equal(toMessages(['a'.repeat(10000)]).length, 3);
});

test('予定の追加・一覧・削除', async () => {
  const { say } = setup();
  const [add] = await say('予定追加 11/1 14:40 ゆめフェス収録 / アリスガーデン');
  assert.match(add, /#1 11\/1\(日\) 14:40 ゆめフェス収録（アリスガーデン）/);
  assert.match((await say('予定一覧'))[0], /ゆめフェス収録/);
  assert.match((await say('予定削除 1'))[0], /削除しました/);
  assert.match((await say('予定一覧'))[0], /ありません/);
  assert.match((await say('予定追加 ゆめフェス'))[0], /日時が読み取れません/);
});

test('日程調整: 投票・取消・確定→予定登録', async () => {
  const { say, handler, db } = setup();
  const [msg] = await say('日程調整 打合せ / 11/5 19:00 / 11/6 20:00');
  assert.equal(msg.quickReply.items.length, 2);
  const pb = (userId, opt) => handler.onPostback({ source: { ...src, userId }, userId, data: `poll=1&opt=${opt}` });
  await pb('U1', 0); await pb('U2', 0);
  assert.match((await say('日程結果 1'))[0], /1\. 11\/5 19:00 — 2票（A、B）/);
  assert.match((await pb('U2', 0))[0], /取消/);
  assert.match((await say('日程確定 1 1'))[0], /確定/);
  assert.equal(db.upcomingEvents('G1', NOW)[0].title, '打合せ');
  assert.match((await pb('U1', 1))[0], /締め切られています/);
});

test('要約・議事録・Q&A・記録停止', async () => {
  const { say, asked, db, clock } = setup();
  assert.equal(await say('こんにちは、準備どう？'), null);
  assert.equal(db.messagesBetween('G1', 0, NOW + 1).length, 1);
  assert.deepEqual(await say('要約'), ['AI応答']);
  assert.match(asked.at(-1).prompt, /A: こんにちは、準備どう？/);

  await say('議事録開始'); clock.t += 60000;
  await say('次回は11/5に決定'); clock.t += 60000;
  assert.deepEqual(await say('議事録終了'), ['AI応答']);
  assert.match(asked.at(-1).prompt, /次回は11\/5に決定/);

  // メンション or 「質問」で Q&A
  const mention = { mentionees: [{ index: 0, length: 5, isSelf: true }] };
  assert.deepEqual(await say('@Bot 次の予定は？', { mention }), ['AI応答']);
  assert.match(asked.at(-1).prompt, /次の予定は？/);
  assert.deepEqual(await say('質問 集合場所は？'), ['AI応答']);

  await say('記録停止');
  const before = db.messagesBetween('G1', 0, clock.t + 1).length;
  await say('停止後の発言');
  assert.equal(db.messagesBetween('G1', 0, clock.t + 1).length, before);
});

test('スケジューラ: 3日前告知/前日/1時間前、重複なし・過去ステージはスキップ', async () => {
  const { say, db, handler, line, pushed, clock } = setup();
  await say('予定追加 11/10 14:00 ゆめフェス収録');
  const run = () => tick({ db, line, handler, now: clock.t });
  await run(); assert.equal(pushed.length, 0);
  clock.t = fromJst(2026, 11, 7, 14, 0); await run();
  assert.equal(pushed.length, 1); assert.equal(pushed[0][1][0], 'AI応答'); // 告知
  await run(); assert.equal(pushed.length, 1); // 二重送信なし
  clock.t = fromJst(2026, 11, 9, 14, 0); await run();
  assert.match(pushed[1][1][0], /明日は「ゆめフェス収録」/);
  clock.t = fromJst(2026, 11, 10, 13, 0); await run();
  assert.match(pushed[2][1][0], /1時間後は「ゆめフェス収録」/);

  // 直前に登録した予定は過ぎたステージを送らない
  clock.t = fromJst(2026, 11, 10, 12, 0);
  await say('予定追加 11/10 20:00 直前の予定');
  await run(); assert.equal(pushed.length, 3);
});
