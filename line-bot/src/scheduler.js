import { STAGES, stageLabel } from './stages.js';
import { formatJst } from './datetime.js';

/** 毎分呼ぶ。期限が来たステージのメッセージを push する */
export async function tick({ db, line, handler, now = Date.now() }) {
  for (const e of db.allUpcomingEvents(now)) {
    const sent = new Set(e.sent_stages ? e.sent_stages.split(',') : []);
    const due = STAGES.filter((s) => !sent.has(s.key) && e.start_ts - s.offset <= now);
    if (!due.length) continue;
    // 遅延で複数溜まっていたら一番直近のものだけ送り、全て送信済みにする（二重送信防止のため先に記録）
    const stage = due.reduce((a, b) => (a.offset < b.offset ? a : b));
    for (const s of due) sent.add(s.key);
    db.setSentStages(e.id, [...sent]);

    const where = e.location ? `\n📍${e.location}` : '';
    let msg;
    if (stage.kind === 'announce') {
      msg = await handler.announceText(e);
    } else {
      msg = `⏰ ${stageLabel[stage.key]}は「${e.title}」です！\n🗓 ${formatJst(e.start_ts)}${where}`;
    }
    await line.push(e.group_id, [msg]);
  }
}
