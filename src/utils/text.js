// Text matching that ignores case and diacritics, so "wojcik" finds "Wójcik".

// Letters that don't decompose into a base letter and a combining mark.
const SPECIAL_LETTERS = {
  ł: 'l',
  đ: 'd',
  ð: 'd',
  ø: 'o',
  ħ: 'h',
  ı: 'i',
  ŀ: 'l',
  þ: 'th',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
}
const SPECIAL_RE = new RegExp(`[${Object.keys(SPECIAL_LETTERS).join('')}]`, 'g')
const MARKS_RE = /\p{M}/gu

/** Lower-cased text without diacritics, for comparing what users type with stored values. */
export function foldText(value) {
  // Lower-cased first: some capitals (e.g. "İ") lower-case to a letter plus a mark.
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(MARKS_RE, '')
    .replace(SPECIAL_RE, (c) => SPECIAL_LETTERS[c])
}

/** Whether `text` contains `term`, ignoring case and diacritics. */
export function includesText(text, term) {
  return foldText(text).includes(foldText(term))
}
