/**
 * The `_licence` block every data file carries, and the guards that keep a
 * generated file inside the house rules.
 *
 * THIS IS A MANUAL DATA STEP, NOT A BUILD. See tools/lib/sources.mjs.
 *
 * The EDRDG and KanjiVG acknowledgements are copied from Runcible
 * (projects/runcible-site/tools/lib/corpus.mjs), which quotes them exactly.
 * They are quoted, not paraphrased: changing one of them is a licence breach
 * that renders correctly, and nobody would notice at review time.
 *
 * A file here usually mixes sources. A dictionary shard is JMdict glosses,
 * KANJIDIC readings (the per-kanji split) and a Tatoeba frequency band; a
 * kanji shard is KANJIDIC plus KanjiVG's component names. The block is shaped
 * for that: the top level is the licence that governs the file (EDRDG's
 * CC BY-SA 4.0, the ShareAlike terms the whole file inherits), and `inputs[]`
 * lists every other source with its own licence, its own acknowledgement and
 * what it contributed. tools/check-data.mjs holds both levels to the same
 * rule: `source`, `spdx` and `screen`, and an acknowledgement whenever the
 * screen is required.
 */

export const GENERATED_AT = '2026-10-01';

// Written as an escape on purpose: a source file that spells the banned
// character out would itself be a hit for the check it exists to enforce.
export const EM_DASH = '\u2014';

export const LICENCES = {
  edrdg: {
    source: 'JMdict / EDICT, Electronic Dictionary Research and Development Group',
    url: 'https://www.edrdg.org/edrdg/licence.html',
    spdx: 'CC-BY-SA-4.0',
    derived: true,
    id: 'edrdg',
    acknowledgement:
      "This site uses the JMdict/EDICT and KANJIDIC dictionary files. These files are the property of the Electronic Dictionary Research and Development Group, and are used in conformance with the Group's licence.",
    links: [
      'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
      'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
    ],
    screen: 'required',
  },
  // JMnedict is the EDRDG's too, under the same licence, and its sample
  // acknowledgements (https://www.edrdg.org/edrdg/sample.html) name the files
  // a site uses and allow "any reasonable variant". This is that sample with
  // the names file named, worded exactly as the dictionary's own above.
  jmnedict: {
    source: 'JMnedict / ENAMDICT, Electronic Dictionary Research and Development Group',
    url: 'https://www.edrdg.org/edrdg/licence.html',
    spdx: 'CC-BY-SA-4.0',
    derived: true,
    id: 'jmnedict',
    acknowledgement:
      "This site uses the JMnedict/ENAMDICT dictionary file. This file is the property of the Electronic Dictionary Research and Development Group, and is used in conformance with the Group's licence.",
    links: [
      'https://www.edrdg.org/enamdict/enamdict_doc.html',
      'https://www.edrdg.org/edrdg/licence.html',
    ],
    screen: 'required',
  },
  kanjivg: {
    source: 'KanjiVG, Ulrich Apel',
    url: 'http://kanjivg.tagaini.net',
    spdx: 'CC-BY-SA-3.0',
    derived: true,
    id: 'kanjivg',
    acknowledgement:
      "Attribution. You must attribute the work by stating your use of KanjiVG in your own copyright header and linking to KanjiVG's website (http://kanjivg.tagaini.net)",
    links: [
      'http://kanjivg.tagaini.net',
      'https://github.com/KanjiVG/kanjivg',
      'https://creativecommons.org/licenses/by-sa/3.0/',
    ],
    screen: 'required',
  },
  // Tatoeba is counted, never shipped: no sentence, no fragment of one, and
  // no sentence id reaches data/. What reaches the page is a band from 1 to 5
  // per dictionary key. The credit still travels in the file header, because
  // the band would not exist without the corpus, but nothing of the corpus is
  // on screen for a screen credit to attach to.
  tatoeba: {
    source: 'Tatoeba Project, Japanese sentences',
    url: 'https://tatoeba.org/en/downloads',
    spdx: 'CC-BY-2.0-FR',
    derived: true,
    id: 'tatoeba',
    acknowledgement:
      'Word frequency bands are counted over the Tatoeba Project\'s Japanese sentences, used under the Creative Commons Attribution 2.0 France licence. No sentence is included.',
    links: [
      'https://tatoeba.org/en/downloads',
      'https://creativecommons.org/licenses/by/2.0/fr/',
    ],
    screen: 'none',
  },
};

/**
 * A full `_licence` header. `primary` governs the file; `inputs` is a list of
 * `[id, use]` pairs, `use` saying in a few words which fields came from it.
 */
export function licenceBlock(primary, generatedBy, { inputs = [], ...extra } = {}) {
  const base = LICENCES[primary];
  if (!base) throw new Error(`unknown licence id: ${primary}`);
  const block = { ...base, ...extra };
  if (inputs.length) {
    block.inputs = inputs.map(([id, use]) => {
      const lic = LICENCES[id];
      if (!lic) throw new Error(`unknown licence id: ${id}`);
      return {
        id: lic.id,
        source: lic.source,
        url: lic.url,
        spdx: lic.spdx,
        screen: lic.screen,
        acknowledgement: lic.acknowledgement,
        use,
      };
    });
  }
  block.generated_by = generatedBy;
  block.generated_at = GENERATED_AT;
  return block;
}

/** Every string reachable from `value`, object keys included, with its path. */
export function* walkStrings(value, at = '$') {
  if (typeof value === 'string') { yield [at, value]; return; }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) yield* walkStrings(value[i], `${at}[${i}]`);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      yield [`${at}{key}`, k];
      yield* walkStrings(v, `${at}.${k}`);
    }
  }
}

/**
 * The five words the fleet's house style bans, as whole words. A gloss is
 * learner-facing English, so the rule reaches it the same way Runcible's
 * build-kanji.mjs applies it: the one upstream gloss that breaks it is passed
 * over for the next one in the same sense, and the dictionary is not rewritten.
 */
export const BANNED_WORDS = /\b(powerful|seamless|leverages|robust|utilize)\b/i;

/** True when an upstream string cannot ship as it is. */
export function unshippable(text) {
  return text.includes(EM_DASH) || BANNED_WORDS.test(text);
}
