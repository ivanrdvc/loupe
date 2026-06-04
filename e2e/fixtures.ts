// Known values emitted by the `fixtures` telemetry provider
// (src/lib/telemetry/fixtures.ts). Kept as plain constants here so specs don't
// import server code; keep them in sync with that module.

export const CHAT = {
  sessionId: 'e2e-session-chat',
  traceId: 'tr-chat',
  title: 'Weather in Tokyo',
  chatSpanId: 'sp-chat',
  agent: 'WeatherBot',
  toolName: 'get_weather',
  userMessage: 'What is the weather in Tokyo?',
  assistantSnippet: '18°C',
  rawAttrKey: 'gen_ai.request.model',
} as const

export const SINGLE_TRACE = {
  sessionId: 'e2e-trace-7f3a2b',
  agent: 'SoloBot',
} as const
