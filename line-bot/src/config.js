export function loadConfig(env = process.env) {
  return {
    channelSecret: env.LINE_CHANNEL_SECRET || '',
    channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN || '',
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    claudeModel: env.CLAUDE_MODEL || 'claude-sonnet-5-5',
    port: Number(env.PORT || 3000),
    dbPath: env.DB_PATH || './data/bot.db',
    retentionDays: Number(env.RETENTION_DAYS || 30),
  };
}
