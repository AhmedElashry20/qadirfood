/** دمج كلاسات — بيتجاهل false/null/undefined. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** نغمات الألوان المشتركة في كل الكيت. */
export type Tone = 'brand' | 'neutral' | 'ok' | 'warn' | 'bad';
