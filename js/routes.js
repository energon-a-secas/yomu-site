// The page's places, as the address names them. No DOM.
//
// Moved out of events-kanji.js, which applies them, so it and events-play.js
// can both read them and both stay under the 500-line rule. A route is a
// place, never a text: takeFragmentText in state.js reads only #t=.
//
// My kanji: the list (#/kanji), a review, the Collection and History; the
// parent of each of the last three is the list, and the list's is the reader.
// Play: the five games (#/play) and one route per game, whose parent is
// #/play. Back is history.back() when the history entry before this one is
// the parent route, otherwise a replaceState to it (events-kanji.js leave).

export const ROUTES = Object.freeze({
  '#/kanji': 'list',
  '#/kanji/review': 'review',
  '#/kanji/collection': 'collection',
  '#/kanji/history': 'history',
  '#/play': 'play',
  '#/play/which': 'play-which',
  '#/play/odd': 'play-odd',
  '#/play/twins': 'play-twins',
  '#/play/names': 'play-names',
  '#/play/spaces': 'play-spaces',
});

export const HASH = Object.freeze({
  reader: '',
  list: '#/kanji',
  review: '#/kanji/review',
  collection: '#/kanji/collection',
  history: '#/kanji/history',
  play: '#/play',
  'play-which': '#/play/which',
  'play-odd': '#/play/odd',
  'play-twins': '#/play/twins',
  'play-names': '#/play/names',
  'play-spaces': '#/play/spaces',
});

export const PARENT = Object.freeze({
  review: 'list',
  collection: 'list',
  history: 'list',
  list: 'reader',
  reader: 'reader',
  play: 'reader',
  'play-which': 'play',
  'play-odd': 'play',
  'play-twins': 'play',
  'play-names': 'play',
  'play-spaces': 'play',
});

/** The string each of Play's routes is titled with (strings-play.js). */
export const PLAY_TITLE = Object.freeze({
  play: 'play', 'play-which': 'gameWhich', 'play-odd': 'gameOdd', 'play-twins': 'gameTwins', 'play-names': 'gameNames', 'play-spaces': 'gameSpaces',
});

/** The games, by route; each route is 'play-' and the game's id. */
export const GAMES = Object.freeze(['which', 'odd', 'twins', 'names', 'spaces']);

/** The route an address names; anything else is the reader. */
export function routeOf(hash) {
  return ROUTES[hash] || 'reader';
}

/** Is this route Play's: the five games, or one of them. */
export function isPlay(route) {
  return route === 'play' || String(route).startsWith('play-');
}

/** The game a route shows, or null on #/play and everywhere else. */
export function gameOf(route) {
  const id = String(route).startsWith('play-') ? String(route).slice(5) : null;
  return GAMES.includes(id) ? id : null;
}
