import type { SkillMarketFile, SkillMarketRiskLabel } from './types.js'

const RISK_LABEL_ORDER: SkillMarketRiskLabel[] = [
  'allowed-tools',
  'hooks',
  'scripts',
  'executables',
  'external-network',
  'requires-api-key',
]

const EXECUTABLE_EXTENSION = /\.(sh|bash|zsh|fish|ps1|cmd|bat|py|js|ts)$/i
const API_KEYWORD = /api[\s_-]?key|token|secret/i

export function analyzeSkillRisk(input: {
  entryContent?: string
  files: SkillMarketFile[]
  requiresApiKey?: boolean
}): SkillMarketRiskLabel[] {
  const labels = new Set<SkillMarketRiskLabel>()
  const entryContent = input.entryContent ?? ''
  const entryLines = entryContent.split(/\r?\n/)

  if (entryLines.some((line) => line.includes('allowed-tools:'))) {
    labels.add('allowed-tools')
  }

  if (entryLines.some((line) => line.includes('hooks:'))) {
    labels.add('hooks')
  }

  if (/https?:\/\//i.test(entryContent)) {
    labels.add('external-network')
  }

  if (input.requiresApiKey || API_KEYWORD.test(entryContent)) {
    labels.add('requires-api-key')
  }

  for (const file of input.files) {
    const normalizedPath = normalizeSkillFilePath(file)

    if (normalizedPath.startsWith('scripts/')) {
      labels.add('scripts')
    }

    if (normalizedPath.startsWith('bin/') || EXECUTABLE_EXTENSION.test(normalizedPath)) {
      labels.add('executables')
    }
  }

  return RISK_LABEL_ORDER.filter((label) => labels.has(label))
}

function normalizeSkillFilePath(file: SkillMarketFile): string {
  return file.path.replace(/\\/g, '/')
}
