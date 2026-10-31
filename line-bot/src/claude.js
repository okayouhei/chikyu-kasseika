export class NoApiKeyError extends Error {}

export function createClaude({ apiKey, model, fetchImpl = fetch }) {
  return {
    enabled: Boolean(apiKey),
    async ask({ system, prompt, maxTokens = 1500 }) {
      if (!apiKey) throw new NoApiKeyError('ANTHROPIC_API_KEY が未設定です');
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    },
  };
}
