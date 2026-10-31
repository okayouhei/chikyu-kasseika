import { parseLeading, formatJst, formatJstFull } from './datetime.js';
import { STAGES, stageLabel } from './stages.js';

const BOT_NAME = '活性化くん';
const SYSTEM_BASE = `あなたは「地球活性化実行委員会」のLINEグループに参加しているアシスタントBot「${BOT_NAME}」です。日本語で、親しみやすく丁寧に、LINEで読みやすい短めの文章で答えます。絵文字は控えめに。分からないことは推測せず「分かりません」と伝えます。`;

export const HELP = `【${BOT_NAME} の使い方】
■ 予定・告知（「 / 」の前後はスペースを入れてください）
・予定追加 11/1 14:40 ゆめフェス収録 / アリスガーデン
・予定一覧 ／ 予定削除 3
・告知 3（AIが告知文を作成して投稿）
 ※予定は3日前に告知文、前日と1時間前にリマインドを自動投稿します
■ 日程調整
・日程調整 次回の打合せ / 11/5 19:00 / 11/6 20:00 / 11/8 10:00
 → 出てきたボタンで投票（もう一度押すと取消）
・日程結果 2 ／ 日程確定 2 1（候補1で確定→予定に自動登録）
■ 要約・議事録
・要約（直近24時間）／ 要約 3日 ／ 要約 6時間
・議事録開始 → 話し合い → 議事録終了（AIが議事録を作成）
■ 質問
・@${BOT_NAME} 質問内容 （または「質問 ○○」）
■ プライバシー
・記録停止 ／ 記録再開（要約・議事録用の発言保存を止める/再開）
 ※保存した発言は一定期間で自動削除されます`;

const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function createHandler({ db, line, claude, now = () => Date.now(), retentionDays = 30 }) {
  const fmtMsgs = (msgs) => msgs.map((m) => `[${formatJst(m.ts)}] ${m.name}: ${m.text}`).join('\n');

  async function ai(system, prompt, maxTokens) {
    if (!claude.enabled) return '⚠️ AI機能は未設定です（ANTHROPIC_API_KEY を設定すると使えます）。';
    try { return await claude.ask({ system: `${SYSTEM_BASE}\n${system}`, prompt, maxTokens }); }
    catch (e) { console.error(e); return '⚠️ AIの処理中にエラーが発生しました。しばらくしてからもう一度お試しください。'; }
  }

  const eventLine = (e) => `#${e.id} ${formatJst(e.start_ts)} ${e.title}${e.location ? `（${e.location}）` : ''}`;
  const eventDetail = (e) => `${e.title}\n日時: ${formatJstFull(e.start_ts)}${e.location ? `\n場所: ${e.location}` : ''}${e.note ? `\n備考: ${e.note}` : ''}`;

  /** 予定を作成し、すでに過ぎたステージは送信済み扱いにする */
  function createEvent({ groupId, title, startTs, location, createdBy }) {
    const t = now();
    const sent = STAGES.filter((s) => startTs - s.offset <= t).map((s) => s.key).join(',');
    const id = db.addEvent({ groupId, title, startTs, location, sentStages: sent, createdBy });
    return db.getEvent(id, groupId);
  }

  async function announceText(e, extra = '') {
    return ai('イベント告知文を作ります。参加者がワクワクして予定を入れたくなる、200〜350文字程度の告知文を出力してください。日時・場所は正確に。事実にない情報は足さない。',
      `次のイベントの告知文をグループLINE向けに書いてください。\n${eventDetail(e)}${extra ? `\n補足: ${extra}` : ''}`, 700);
  }

  function pollText(poll) {
    const votes = db.votes(poll.id);
    const lines = poll.options.map((o, i) => {
      const who = votes.filter((v) => v.opt === i).map((v) => v.name);
      return `${i + 1}. ${o} — ${who.length}票${who.length ? `（${who.join('、')}）` : ''}`;
    });
    return `📅 日程調整 #${poll.id}「${poll.title}」${poll.closed ? '【締切】' : ''}\n${lines.join('\n')}`;
  }
  const pollMessage = (poll) => ({
    type: 'text',
    text: `${pollText(poll)}\n\n↓ 参加できる候補をタップ（もう一度押すと取消）`,
    quickReply: {
      items: poll.options.slice(0, 13).map((o, i) => ({
        type: 'action',
        action: { type: 'postback', label: trunc(`${i + 1}. ${o}`, 20), data: `poll=${poll.id}&opt=${i}` },
      })),
    },
  });

  const commands = [
    [/^(?:ヘルプ|help|使い方)$/i, async () => [HELP]],

    [/^予定追加\s+([\s\S]+)$/, async (m, ctx) => {
      const p = parseLeading(m[1], now());
      if (!p) return ['日時が読み取れませんでした。\n例）予定追加 11/1 14:40 ゆめフェス収録 / アリスガーデン'];
      const [title, ...loc] = p.rest.split(/\s+\/\s+/);
      if (!title.trim()) return ['タイトルを入れてください。\n例）予定追加 11/1 14:40 ゆめフェス収録 / アリスガーデン'];
      const e = createEvent({ groupId: ctx.groupId, title: title.trim(), startTs: p.ts, location: loc.join(' / ').trim(), createdBy: ctx.userId });
      return [`予定を登録しました。\n${eventLine(e)}\n（3日前に告知、前日と1時間前にリマインドします）`];
    }],

    [/^予定一覧$/, async (m, ctx) => {
      const list = db.upcomingEvents(ctx.groupId, now());
      return [list.length ? `📌 今後の予定\n${list.map(eventLine).join('\n')}` : '今後の予定はありません。'];
    }],

    [/^予定削除\s+#?(\d+)$/, async (m, ctx) =>
      [db.deleteEvent(+m[1], ctx.groupId) ? `予定 #${m[1]} を削除しました。` : `予定 #${m[1]} が見つかりません。`]],

    [/^告知\s+#?(\d+)(?:\s+([\s\S]+))?$/, async (m, ctx) => {
      const e = db.getEvent(+m[1], ctx.groupId);
      return [e ? await announceText(e, m[2] || '') : `予定 #${m[1]} が見つかりません。`];
    }],

    [/^日程調整\s+([\s\S]+)$/, async (m, ctx) => {
      const [title, ...opts] = m[1].split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
      if (!title || opts.length < 2) return ['タイトルと候補を2つ以上入れてください。\n例）日程調整 次回の打合せ / 11/5 19:00 / 11/6 20:00'];
      if (opts.length > 13) return ['候補は13個までです。'];
      const id = db.addPoll(ctx.groupId, title, opts);
      return [pollMessage(db.getPoll(id, ctx.groupId))];
    }],

    [/^日程結果\s+#?(\d+)$/, async (m, ctx) => {
      const poll = db.getPoll(+m[1], ctx.groupId);
      return [poll ? pollText(poll) : `日程調整 #${m[1]} が見つかりません。`];
    }],

    [/^日程確定\s+#?(\d+)\s+(\d+)$/, async (m, ctx) => {
      const poll = db.getPoll(+m[1], ctx.groupId);
      if (!poll) return [`日程調整 #${m[1]} が見つかりません。`];
      const opt = poll.options[+m[2] - 1];
      if (!opt) return [`候補 ${m[2]} はありません。`];
      db.closePoll(poll.id);
      const p = parseLeading(opt, now());
      if (!p) return [`「${opt}」で確定しました。（日時として読めなかったので予定には登録していません）`];
      const e = createEvent({ groupId: ctx.groupId, title: poll.title, startTs: p.ts, createdBy: ctx.userId });
      return [`✅「${opt}」で確定！予定に登録しました。\n${eventLine(e)}`];
    }],

    [/^要約(?:\s+(\d+)\s*(時間|日))?$/, async (m, ctx) => {
      const hours = m[1] ? +m[1] * (m[2] === '日' ? 24 : 1) : 24;
      const msgs = db.messagesBetween(ctx.groupId, now() - hours * 3600000, now());
      if (!msgs.length) return ['対象期間の発言が記録されていません。'];
      return [await ai('グループ会話の要約を作ります。決まったこと / 未決事項 / 誰が何をやるか(ToDo) に整理し、箇条書きで簡潔に。',
        `直近${hours}時間のグループ会話を要約してください。\n\n${fmtMsgs(msgs)}`, 1200)];
    }],

    [/^議事録(開始|終了)$/, async (m, ctx) => {
      if (m[1] === '開始') {
        db.setMinutesStart(ctx.groupId, now());
        return ['📝 議事録の記録を開始しました。終わったら「議事録終了」と送ってください。'];
      }
      const start = db.state(ctx.groupId).minutes_start;
      if (!start) return ['議事録が開始されていません。「議事録開始」と送ってください。'];
      db.setMinutesStart(ctx.groupId, null);
      const msgs = db.messagesBetween(ctx.groupId, start, now(), 600);
      if (!msgs.length) return ['この間の発言が記録されていません。'];
      return [await ai('会議の議事録を作ります。次の形式で出力: 【日時】【参加者】【議題と議論の要点】【決定事項】【ToDo(担当・期限)】【次回に向けて】。会話にない内容は書かない。',
        `${formatJstFull(start)} 〜 ${formatJst(now())} の会話から議事録を作成してください。\n\n${fmtMsgs(msgs)}`, 2000)];
    }],

    [/^記録(停止|再開)$/, async (m, ctx) => {
      db.setRecording(ctx.groupId, m[1] === '再開');
      return [m[1] === '停止' ? '🔕 発言の保存を停止しました（要約・議事録・質問時の文脈が使えなくなります）。' : '🔔 発言の保存を再開しました。'];
    }],
  ];

  async function answer(question, ctx) {
    const t = now();
    const ev = db.upcomingEvents(ctx.groupId, t, 10).map(eventLine).join('\n') || '（なし）';
    const recent = db.messagesBetween(ctx.groupId, t - 3 * 86400000, t, 60);
    return ai('グループの会話履歴と今後の予定を参考に、質問に答えます。参考情報に答えがなければ一般知識で答えつつ、そう断ってください。',
      `【今後の予定】\n${ev}\n\n【直近の会話】\n${recent.length ? fmtMsgs(recent) : '（なし）'}\n\n【質問】${ctx.name}さん: ${question}`, 1000);
  }

  /** メッセージイベント → 返信メッセージ配列（なければ null） */
  async function onText({ source, userId, text, mention }) {
    const groupId = source.groupId || source.roomId || userId;
    const isGroup = source.type === 'group' || source.type === 'room';
    const name = await line.getName(source, userId);
    const ctx = { groupId, userId, name };

    let body = text;
    const self = (mention?.mentionees || []).filter((x) => x.isSelf).sort((a, b) => b.index - a.index);
    for (const s of self) body = body.slice(0, s.index) + body.slice(s.index + s.length);
    body = body.normalize('NFKC').trim();
    const mentioned = self.length > 0;

    for (const [re, fn] of commands) {
      const m = body.match(re);
      if (m) return fn(m, ctx);
    }

    const prefixed = body.match(/^(?:質問|ボット|bot|活性化くん)[\s、,:：]+([\s\S]+)$/i);
    if (isGroup && db.state(groupId).recording) db.addMessage(groupId, userId, name, text, now());
    if (!isGroup || mentioned || prefixed) {
      const q = prefixed ? prefixed[1] : body;
      return q ? [await answer(q, ctx)] : null;
    }
    return null;
  }

  async function onPostback({ source, userId, data }) {
    const groupId = source.groupId || source.roomId || userId;
    const params = new URLSearchParams(data);
    const poll = db.getPoll(+params.get('poll'), groupId);
    if (!poll) return null;
    if (poll.closed) return ['この日程調整は締め切られています。'];
    const opt = +params.get('opt');
    const name = await line.getName(source, userId);
    const on = db.toggleVote(poll.id, userId, name, opt);
    return [`${name}さん: 「${poll.options[opt]}」を${on ? '選択' : '取消'}しました。\n\n${pollText(poll)}`];
  }

  const onJoin = () => [`はじめまして、${BOT_NAME}です！予定の告知・日程調整・リマインド・要約/議事録・質問をお手伝いします。\n\n${HELP}\n\n※要約・議事録のため、このグループの発言を一定期間保存します。止めるには「記録停止」と送ってください。`];

  function purge() { db.purgeBefore(now() - retentionDays * 86400000); }

  return { onText, onPostback, onJoin, announceText, purge };
}
