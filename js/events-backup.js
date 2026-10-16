// My kanji's Export and Import: the backup file written from the store, and
// a chosen file read, checked (kanji-backup.js) and merged into it. Moved
// out of events-kanji.js, which is at its 500-line limit; the list's
// actions and the file input there call these.

import { ui } from './strings.js';
import { myKanji } from './kanji-store.js';
import { myWords } from './word-store.js';
import { MAX_IMPORT_BYTES, parseImport, importNote } from './kanji-backup.js';
import { view, paintNote } from './render-mykanji.js';
import { today } from './render-save.js';
import { downloadText } from './neorgon-dom.js';
import { afterChange } from './events-kanji.js';

function say(msg) {
  view.note = msg;
  paintNote();
}

export function exportAll() {
  const day = today();
  const file = `yomu-kanji-${day}.json`;
  const doc = myKanji().exportDoc(day);
  const words = myWords().exportList();
  if (words.length) doc.words = words;
  downloadText(`${JSON.stringify(doc, null, 1)}\n`, file, 'application/json');
  say(ui('exported', { file }));
}

export async function importFile(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) { say(ui('importSize')); return; }
  let text;
  try { text = await file.text(); } catch { say(ui('importRead')); return; }
  const r = parseImport(text);
  if (!r.ok) {
    say(ui({ json: 'importJson', format: 'importFormat', empty: 'importEmpty' }[r.reason] || 'importFormat'));
    return;
  }
  const sum = myKanji().merge(r.data);
  // The backup's saved words, checked field by field by the words store itself.
  if (Array.isArray(r.words) && r.words.length) sum.words = myWords().merge(r.words);
  view.note = importNote(sum, r.dropped);
  afterChange();
}
