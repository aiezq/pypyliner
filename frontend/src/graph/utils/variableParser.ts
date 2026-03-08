/**
 * Extract variable names from a command template string.
 * Variables are denoted by `{variableName}` syntax.
 *
 * @example
 * parseVariables('apt install {package}')       → ['package']
 * parseVariables('scp {user}@{host}:{path} .') → ['user', 'host', 'path']
 * parseVariables('ls -la')                      → []
 */
const VARIABLE_REGEX = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g

export function parseVariables(command: string): string[] {
  const names = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = VARIABLE_REGEX.exec(command)) !== null) {
    names.add(match[1])
  }

  return Array.from(names)
}

/**
 * Replace `{variableName}` placeholders with actual values.
 */
export function substituteVariables(
  command: string,
  variables: Record<string, string>,
): string {
  return command.replace(VARIABLE_REGEX, (fullMatch, varName: string) => {
    return varName in variables ? variables[varName] : fullMatch
  })
}
