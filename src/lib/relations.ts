export interface RelationGroup {
  sense: number;
  words: string[];
}

export interface GroupedRelations {
  groups: RelationGroup[];
  other: string[];
}

const DEFAULT_DISPLAY_LIMIT = 8;

/**
 * Splits a flat synonym list into per-sense groups using a parallel index list.
 * Indexes that are missing, short, out of range, or -1 land in `other`.
 * Each sense is capped so a broad word cannot crowd out the card.
 */
export function groupRelations(
  words: readonly string[],
  indexes: readonly number[] | undefined,
  senseCount: number,
  limit = DEFAULT_DISPLAY_LIMIT,
): GroupedRelations {
  const other: string[] = [];
  const buckets = Array.from({ length: Math.max(0, senseCount) }, () => [] as string[]);
  const aligned = indexes?.length === words.length ? indexes : [];

  words.forEach((word, position) => {
    const sense = aligned[position];
    if (!Number.isInteger(sense) || sense < 0 || sense >= senseCount) {
      other.push(word);
      return;
    }
    if (buckets[sense].length >= limit) {
      other.push(word);
      return;
    }
    buckets[sense].push(word);
  });

  return {
    groups: buckets
      .map((groupWords, sense) => ({ sense, words: groupWords }))
      .filter((group) => group.words.length > 0),
    other,
  };
}
