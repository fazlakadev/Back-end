const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;
const ALEF = /[أإآٱ]/g;
const TAA_MARBUTA = /ة/g;
const ALEF_MAQSURA = /ى/g;
const HAMZA_WAW = /ؤ/g;
const HAMZA_YAA = /ئ/g;

export function normalizeArabic(input: string): string {
  return input
    .replace(DIACRITICS, '')
    .replace(ALEF, 'ا')
    .replace(TAA_MARBUTA, 'ه')
    .replace(ALEF_MAQSURA, 'ي')
    .replace(HAMZA_WAW, 'و')
    .replace(HAMZA_YAA, 'ي')
    .trim();
}

function stripDefiniteArticle(word: string): string {
  if (word.length > 2 && word.startsWith('ال')) {
    return word.slice(2);
  }
  if (word.length > 2 && word.startsWith('وال')) {
    return word.slice(3);
  }
  return word;
}

export function buildQueryVariants(query: string): string[] {
  const normalized = normalizeArabic(query);
  if (!normalized) return [];
  const words = normalized.split(/\s+/);
  const variants = new Set<string>([normalized]);
  const strippedWords = words.map(stripDefiniteArticle);
  if (strippedWords.join(' ') !== normalized) {
    variants.add(strippedWords.join(' '));
  }
  for (const word of strippedWords) {
    if (word.length >= 3) variants.add(word);
  }
  if (normalized.length >= 3) variants.add(normalized.replace(/^\S+\s+/, ''));
  return [...variants].filter(Boolean);
}
