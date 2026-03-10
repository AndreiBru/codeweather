export function stripFlagPairs(args: string[], flags: Set<string>): string[] {
  const sanitized: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (flags.has(arg)) {
      index += 1
      continue
    }
    sanitized.push(arg)
  }

  return sanitized
}
