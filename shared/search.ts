export function searchTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

export function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const text = haystack.toLowerCase()
  return tokens.every((token) => text.includes(token))
}

export function movementMatchesQuery(
  movement: { name: string; aliases?: string[] | null; muscleGroups?: string[] | null },
  query: string,
): boolean {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return true
  const haystack = [movement.name, ...(movement.aliases ?? []), ...(movement.muscleGroups ?? [])]
    .join(' ')
  return matchesAllTokens(haystack, tokens)
}
