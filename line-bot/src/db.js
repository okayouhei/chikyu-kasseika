import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, user_id TEXT, name TEXT, text TEXT NOT NULL, ts INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_messages_group_ts ON messages(group_id, ts);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, title TEXT NOT NULL, start_ts INTEGER NOT NULL,
      location TEXT DEFAULT '', note TEXT DEFAULT '', sent_stages TEXT DEFAULT '', created_by TEXT);
    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, title TEXT NOT NULL, options TEXT NOT NULL, closed INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS votes (
      poll_id INTEGER NOT NULL, user_id TEXT NOT NULL, name TEXT, opt INTEGER NOT NULL, PRIMARY KEY (poll_id, user_id, opt));
    CREATE TABLE IF NOT EXISTS group_state (
      group_id TEXT PRIMARY KEY, minutes_start INTEGER, recording INTEGER DEFAULT 1);
  `);

  const q = {
    addMsg: db.prepare('INSERT INTO messages (group_id,user_id,name,text,ts) VALUES (?,?,?,?,?)'),
    msgsSince: db.prepare('SELECT name,text,ts FROM messages WHERE group_id=? AND ts>=? AND ts<=? ORDER BY ts DESC LIMIT ?'),
    purge: db.prepare('DELETE FROM messages WHERE ts<?'),
    addEvent: db.prepare('INSERT INTO events (group_id,title,start_ts,location,note,sent_stages,created_by) VALUES (?,?,?,?,?,?,?)'),
    getEvent: db.prepare('SELECT * FROM events WHERE id=? AND group_id=?'),
    upcoming: db.prepare('SELECT * FROM events WHERE group_id=? AND start_ts>=? ORDER BY start_ts LIMIT ?'),
    allUpcoming: db.prepare('SELECT * FROM events WHERE start_ts>=?'),
    delEvent: db.prepare('DELETE FROM events WHERE id=? AND group_id=?'),
    setStages: db.prepare('UPDATE events SET sent_stages=? WHERE id=?'),
    addPoll: db.prepare('INSERT INTO polls (group_id,title,options) VALUES (?,?,?)'),
    getPoll: db.prepare('SELECT * FROM polls WHERE id=? AND group_id=?'),
    closePoll: db.prepare('UPDATE polls SET closed=1 WHERE id=?'),
    getVote: db.prepare('SELECT 1 FROM votes WHERE poll_id=? AND user_id=? AND opt=?'),
    addVote: db.prepare('INSERT INTO votes (poll_id,user_id,name,opt) VALUES (?,?,?,?)'),
    delVote: db.prepare('DELETE FROM votes WHERE poll_id=? AND user_id=? AND opt=?'),
    votes: db.prepare('SELECT user_id,name,opt FROM votes WHERE poll_id=?'),
    ensureState: db.prepare('INSERT OR IGNORE INTO group_state (group_id) VALUES (?)'),
    getState: db.prepare('SELECT * FROM group_state WHERE group_id=?'),
    setMinutes: db.prepare('UPDATE group_state SET minutes_start=? WHERE group_id=?'),
    setRecording: db.prepare('UPDATE group_state SET recording=? WHERE group_id=?'),
  };

  const lastId = (r) => Number(r.lastInsertRowid);
  return {
    raw: db,
    addMessage: (g, u, n, t, ts) => q.addMsg.run(g, u, n, t, ts),
    messagesBetween: (g, from, to, limit = 400) => q.msgsSince.all(g, from, to, limit).reverse(),
    purgeBefore: (ts) => q.purge.run(ts),
    addEvent: (e) => lastId(q.addEvent.run(e.groupId, e.title, e.startTs, e.location || '', e.note || '', e.sentStages || '', e.createdBy || null)),
    getEvent: (id, g) => q.getEvent.get(id, g),
    upcomingEvents: (g, now, limit = 10) => q.upcoming.all(g, now, limit),
    allUpcomingEvents: (now) => q.allUpcoming.all(now),
    deleteEvent: (id, g) => q.delEvent.run(id, g).changes > 0,
    setSentStages: (id, stages) => q.setStages.run(stages.join(','), id),
    addPoll: (g, title, options) => lastId(q.addPoll.run(g, title, JSON.stringify(options))),
    getPoll: (id, g) => { const p = q.getPoll.get(id, g); return p && { ...p, options: JSON.parse(p.options) }; },
    closePoll: (id) => q.closePoll.run(id),
    toggleVote(pollId, userId, name, opt) {
      if (q.getVote.get(pollId, userId, opt)) { q.delVote.run(pollId, userId, opt); return false; }
      q.addVote.run(pollId, userId, name, opt); return true;
    },
    votes: (pollId) => q.votes.all(pollId),
    state(g) { q.ensureState.run(g); return q.getState.get(g); },
    setMinutesStart: (g, ts) => { q.ensureState.run(g); q.setMinutes.run(ts, g); },
    setRecording: (g, on) => { q.ensureState.run(g); q.setRecording.run(on ? 1 : 0, g); },
  };
}
