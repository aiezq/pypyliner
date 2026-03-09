import type { PipelineDraft } from '../../lib/schemas'

const riskMatchers: Array<{ code: string; pattern: RegExp }> = [
  { code: 'sudo', pattern: /(^|\s)sudo(\s|$)/i },
  { code: 'rm', pattern: /(^|\s)rm(\s|$)/i },
  { code: 'dd', pattern: /(^|\s)dd(\s|$)/i },
  { code: 'mkfs', pattern: /(^|\s)mkfs(\.[a-z0-9_-]+)?(\s|$)/i },
  { code: 'systemctl', pattern: /(^|\s)systemctl(\s|$)/i },
  { code: 'iptables', pattern: /(^|\s)iptables(\s|$)/i },
  { code: 'curl_pipe_sh', pattern: /curl\b[^|]*\|\s*(sh|bash)\b/i },
  { code: 'write_etc', pattern: /(\/etc\/|>\s*\/etc\/|\btee\s+\/etc\/)/i },
  { code: 'write_usr', pattern: /(\/usr\/|>\s*\/usr\/|\btee\s+\/usr\/)/i },
  { code: 'write_var_lib', pattern: /(\/var\/lib\/|>\s*\/var\/lib\/|\btee\s+\/var\/lib\/)/i },
]

export function detectDraftRiskFlags(draft: PipelineDraft): string[] {
  const flags = new Set<string>()

  for (const step of draft.steps) {
    for (const matcher of riskMatchers) {
      if (matcher.pattern.test(step.command)) {
        flags.add(matcher.code)
      }
    }
  }

  return Array.from(flags)
}
