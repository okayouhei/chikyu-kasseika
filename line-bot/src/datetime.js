// 日本時間(JST, UTC+9)での日時パース・整形
const JST = 9 * 3600 * 1000;
const DOW = '日月火水木金土';

export function jstParts(ts) {
  const d = new Date(ts + JST);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(), dow: d.getUTCDay() };
}
export const fromJst = (y, m, d, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) - JST;
const pad = (n) => String(n).padStart(2, '0');

export function formatJst(ts) {
  const p = jstParts(ts);
  return `${p.m}/${p.d}(${DOW[p.dow]}) ${pad(p.h)}:${pad(p.min)}`;
}
export function formatJstFull(ts) {
  return `${jstParts(ts).y}/${formatJst(ts)}`;
}

/**
 * 文頭の「日付 + 時刻」を解釈して { ts, rest } を返す。解釈できなければ null。
 * 対応: 2026/11/1 14:40 / 11/1 14:40 / 11月1日 14時40分 / 今日・明日・明後日 14:40 / (来週)水曜 19:00
 */
export function parseLeading(input, now = Date.now()) {
  const text = input.normalize('NFKC').trim();
  const today = jstParts(now);
  let y, m, d, rest;
  let mt;
  if ((mt = text.match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/))) {
    [y, m, d] = [+mt[1], +mt[2], +mt[3]];
    rest = text.slice(mt[0].length);
  } else if ((mt = text.match(/^(\d{1,2})[\/月](\d{1,2})日?/))) {
    [m, d] = [+mt[1], +mt[2]];
    y = today.y;
    rest = text.slice(mt[0].length);
    // 1日以上過去なら来年とみなす
    if (fromJst(y, m, d, 23, 59) < now - 24 * 3600 * 1000) y += 1;
  } else if ((mt = text.match(/^(今日|明日|明後日)/))) {
    const add = { 今日: 0, 明日: 1, 明後日: 2 }[mt[1]];
    const t = jstParts(now + add * 86400000);
    [y, m, d] = [t.y, t.m, t.d];
    rest = text.slice(mt[0].length);
  } else if ((mt = text.match(/^(来週)?([日月火水木金土])曜日?/))) {
    let diff = (DOW.indexOf(mt[2]) - today.dow + 7) % 7;
    if (mt[1]) diff += 7; // 来週◯曜 = 今週の該当曜日の翌週
    const t = jstParts(now + diff * 86400000);
    [y, m, d] = [t.y, t.m, t.d];
    rest = text.slice(mt[0].length);
  } else return null;

  const tm = rest.match(/^\s*(\d{1,2})(?::(\d{2})|時(?:(\d{1,2})分?|半)?)/);
  if (!tm) return null;
  const h = +tm[1];
  const min = tm[2] ? +tm[2] : tm[3] ? +tm[3] : /時半/.test(tm[0]) ? 30 : 0;
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null;
  return { ts: fromJst(y, m, d, h, min), rest: rest.slice(tm[0].length).trim() };
}
