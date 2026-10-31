// 予定ごとの自動配信ステージ（開始時刻の何ms前か）
export const STAGES = [
  { key: 'd3', offset: 3 * 86400000, kind: 'announce' }, // 3日前: AIで告知文を作って投稿
  { key: 'd1', offset: 86400000, kind: 'remind' },       // 前日
  { key: 'h1', offset: 3600000, kind: 'remind' },        // 1時間前
];
export const stageLabel = { d3: '3日前', d1: '明日', h1: '1時間後' };
