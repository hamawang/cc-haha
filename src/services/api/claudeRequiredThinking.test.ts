import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { enableConfigs } from '../../utils/config.js'
import { queryWithModel } from './claude.js'

function sseEvent(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
}

function successfulResponse(): string {
  return [
    sseEvent('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_required_thinking',
        type: 'message',
        role: 'assistant',
        model: 'k3',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    }),
    sseEvent('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }),
    sseEvent('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'OK' },
    }),
    sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sseEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
    }),
    sseEvent('message_stop', { type: 'message_stop' }),
  ].join('')
}

const ENV_KEYS = [
  'NODE_ENV',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
] as const

test('keeps required-thinking models enabled when the caller requests disabled thinking', async () => {
  const requests: Array<Record<string, unknown>> = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests.push(await request.json() as Record<string, unknown>)
      return new Response(successfulResponse(), {
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })
  const configDir = await mkdtemp(join(tmpdir(), 'cc-haha-required-thinking-'))
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
  const globals = globalThis as typeof globalThis & { MACRO?: { BUILD_TIME: string } }
  const originalMacro = globals.MACRO

  try {
    globals.MACRO = { BUILD_TIME: '' }
    process.env.NODE_ENV = 'production'
    process.env.CLAUDE_CONFIG_DIR = configDir
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.port}`
    delete process.env.ANTHROPIC_AUTH_TOKEN
    process.env.ANTHROPIC_API_KEY = 'loopback-test-key'
    process.env.ANTHROPIC_MODEL = 'k3'
    process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = 'k3'
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'k3'
    process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = 'k3'
    process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES =
      'thinking,required_thinking,effort,max_effort'
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES =
      'thinking,required_thinking,effort,max_effort'
    process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES =
      'thinking,required_thinking,effort,max_effort'
    enableConfigs()

    const result = await queryWithModel({
      userPrompt: 'Reply exactly OK',
      signal: new AbortController().signal,
      options: {
        model: 'k3',
        querySource: 'insights',
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })

    expect(result.message.content).toEqual([{ type: 'text', text: 'OK' }])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.model).toBe('k3')
    expect(requests[0]?.thinking).toMatchObject({ type: 'enabled' })
  } finally {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    if (originalMacro === undefined) delete globals.MACRO
    else globals.MACRO = originalMacro
    server.stop(true)
    await rm(configDir, { recursive: true, force: true })
  }
}, 10_000)
