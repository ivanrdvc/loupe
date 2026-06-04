// Deterministic stand-in for the user's agent endpoint, used by the dataset-run
// e2e test. Speaks the OpenAI Responses shape callAgent parses (output_text +
// usage). Wired via DATASET_RUN_ENDPOINT on the e2e server (playwright.config).
import { createServer } from 'node:http'

const port = Number(process.env.FAKE_AGENT_PORT ?? 3211)

createServer((req, res) => {
  let body = ''
  req.on('data', (c) => {
    body += c
  })
  req.on('end', () => {
    // Echo any per-run overrides back into the answer so the e2e can assert they arrived.
    let data = {}
    try {
      data = JSON.parse(body)
    } catch {}
    const parts = ['fake agent answer']
    if (typeof data.instructions === 'string' && data.instructions) parts.push(`sys=${data.instructions}`)
    if (data.temperature != null) parts.push(`temp=${data.temperature}`)
    if (Array.isArray(data.tools) && data.tools.length) parts.push(`tools=${data.tools.map((t) => t.name).join(',')}`)
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        output_text: parts.join(' · '),
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }),
    )
  })
}).listen(port)
