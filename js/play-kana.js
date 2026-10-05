// The kana that look alike, for Play: twenty sets, ten of hiragana and ten
// of katakana, each kana with one line on how to tell it from the others in
// its set. No DOM.
//
// Written for Yomu from the shapes themselves and dedicated to the public
// domain (CC0). Which kana look alike is a fact about the shapes; every hint
// here is our own wording, and none was taken from Tofugu, the Japan
// Foundation apps, Genki, WaniKani, an Anki deck or any published list.
// tests/play.test.mjs holds each set to its script, each kana to one set
// entry, and every hint to both languages.
//
// A kana may be in two sets (さ is in さ ち and in き さ): each time with the
// hint that tells it from that set. The romaji the game asks with is
// kana.js spelled(), so は is ha here: the game asks for the kana, not the
// particle.

const hint = (en, es) => Object.freeze({ en, es });

export const KANA_SETS = Object.freeze([
  {
    id: 'nu-me', script: 'hiragana', chars: [
      ['ぬ', hint('Like め, but the last stroke curls into a small loop at the bottom right.', 'Como め, pero el último trazo se enrosca en un lazo pequeño abajo a la derecha.')],
      ['め', hint('Like ぬ with no loop: the last stroke sweeps out and ends open.', 'Como ぬ sin el lazo: el último trazo sale hacia afuera y termina abierto.')],
    ],
  },
  {
    id: 'wa-ne-re', script: 'hiragana', chars: [
      ['わ', hint('The right side is one wide bulge that ends open, with no loop and no tail.', 'El lado derecho es una sola curva ancha que termina abierta, sin lazo ni cola.')],
      ['ね', hint('The right side ends in a small loop at the bottom.', 'El lado derecho termina en un lazo pequeño abajo.')],
      ['れ', hint('The right side ends in a tail that kicks out to the right.', 'El lado derecho termina en una cola que sale hacia la derecha.')],
    ],
  },
  {
    id: 'sa-chi', script: 'hiragana', chars: [
      ['さ', hint('The bottom curve bows out to the left, like a letter c.', 'La curva de abajo se arquea hacia la izquierda, como una letra c.')],
      ['ち', hint('The bottom curve bows out to the right, like the number 5.', 'La curva de abajo se arquea hacia la derecha, como el número 5.')],
    ],
  },
  {
    id: 'ru-ro', script: 'hiragana', chars: [
      ['る', hint('The stroke ends in a small loop at the bottom.', 'El trazo termina en un lazo pequeño abajo.')],
      ['ろ', hint('The stroke ends open: る with the loop left off.', 'El trazo termina abierto: es る sin el lazo.')],
    ],
  },
  {
    id: 'ha-ho', script: 'hiragana', chars: [
      ['は', hint('One bar crosses the right-hand stroke, which pokes up above it.', 'Una barra cruza el trazo de la derecha, que sobresale por arriba.')],
      ['ほ', hint('Two bars on the right, and the top one caps the stroke: nothing pokes up.', 'Dos barras a la derecha, y la de arriba tapa el trazo: nada sobresale.')],
    ],
  },
  {
    id: 'i-ri', script: 'hiragana', chars: [
      ['い', hint('Two short strokes side by side; the right one is the shorter.', 'Dos trazos cortos lado a lado; el de la derecha es el más corto.')],
      ['り', hint('The right stroke is the long one and drops well below the left.', 'El trazo de la derecha es el largo y baja mucho más que el izquierdo.')],
    ],
  },
  {
    id: 'ko-ni-ta', script: 'hiragana', chars: [
      ['こ', hint('Only the two short strokes, with nothing to their left.', 'Solo los dos trazos cortos, sin nada a su izquierda.')],
      ['に', hint('A plain upright stroke stands to the left of the two.', 'Un trazo vertical simple está a la izquierda de los dos.')],
      ['た', hint('A cross, like a small 十, stands to the left of the two.', 'Una cruz, como un 十 pequeño, está a la izquierda de los dos.')],
    ],
  },
  {
    id: 'ki-sa', script: 'hiragana', chars: [
      ['き', hint('Two short bars cross the top.', 'Dos barras cortas cruzan la parte de arriba.')],
      ['さ', hint('Only one bar crosses the top.', 'Solo una barra cruza la parte de arriba.')],
    ],
  },
  {
    id: 'a-o-me', script: 'hiragana', chars: [
      ['あ', hint('A bar on top, and the upright stroke cuts through the round part; no dot.', 'Una barra arriba, y el trazo vertical atraviesa la parte redonda; sin punto.')],
      ['お', hint('A dot sits at the top right, outside the round part.', 'Un punto está arriba a la derecha, fuera de la parte redonda.')],
      ['め', hint('No bar on top at all: two strokes, and the round part ends open.', 'Ninguna barra arriba: dos trazos, y la parte redonda termina abierta.')],
    ],
  },
  {
    id: 'ma-mo', script: 'hiragana', chars: [
      ['ま', hint('The upright stroke goes straight down and ends in a loop.', 'El trazo vertical baja recto y termina en un lazo.')],
      ['も', hint('The upright stroke bends into a hook that turns up to the right; no loop.', 'El trazo vertical se dobla en un gancho que sube a la derecha; sin lazo.')],
    ],
  },
  {
    id: 'shi-tsu', script: 'katakana', chars: [
      ['シ', hint('The dots stand one over the other on the left, and the long stroke rises from below.', 'Los puntos están uno sobre otro a la izquierda, y el trazo largo sube desde abajo.')],
      ['ツ', hint('The dots sit side by side on top, and the long stroke falls from above.', 'Los puntos están lado a lado arriba, y el trazo largo cae desde arriba.')],
    ],
  },
  {
    id: 'so-n', script: 'katakana', chars: [
      ['ソ', hint('The dot drops from the top, and the long stroke falls from the top right.', 'El punto baja desde arriba, y el trazo largo cae desde arriba a la derecha.')],
      ['ン', hint('The dot sits on the left, and the long stroke rises from the bottom.', 'El punto está a la izquierda, y el trazo largo sube desde abajo.')],
    ],
  },
  {
    id: 'ku-ke-ta-wa', script: 'katakana', chars: [
      ['ク', hint('A short stroke and a long hooked one, with nothing inside.', 'Un trazo corto y uno largo con gancho, sin nada adentro.')],
      ['ケ', hint('The second stroke is a flat bar, and a long stroke falls from its middle.', 'El segundo trazo es una barra plana, y de su centro cae un trazo largo.')],
      ['タ', hint('ク with a short stroke inside it.', 'Es ク con un trazo corto adentro.')],
      ['ワ', hint('A short upright on the left under a flat roof that bends down; no slanted start.', 'Un trazo vertical corto a la izquierda bajo un techo plano que se dobla hacia abajo; no empieza inclinado.')],
    ],
  },
  {
    id: 'u-wa-fu', script: 'katakana', chars: [
      ['ウ', hint('A dot sits on top of the roof.', 'Un punto está encima del techo.')],
      ['ワ', hint('A short upright under the left end of the roof, and no dot.', 'Un trazo vertical corto bajo el extremo izquierdo del techo, y sin punto.')],
      ['フ', hint('Only the roof that bends down: nothing on top, nothing on the left.', 'Solo el techo que se dobla hacia abajo: nada arriba, nada a la izquierda.')],
    ],
  },
  {
    id: 'su-nu', script: 'katakana', chars: [
      ['ス', hint('The short stroke only touches the long one and runs off to the lower right.', 'El trazo corto solo toca el largo y sale hacia abajo a la derecha.')],
      ['ヌ', hint('The short stroke crosses right through the long one, making an X.', 'El trazo corto atraviesa el largo y forma una X.')],
    ],
  },
  {
    id: 'ko-yu-yo', script: 'katakana', chars: [
      ['コ', hint('Open on the left, with nothing in the middle.', 'Abierta a la izquierda, sin nada en el medio.')],
      ['ユ', hint('The long bottom bar sticks out past the right side.', 'La barra larga de abajo sobresale por la derecha.')],
      ['ヨ', hint('A third bar sits in the middle.', 'Una tercera barra está en el medio.')],
    ],
  },
  {
    id: 'a-ma', script: 'katakana', chars: [
      ['ア', hint('The second stroke starts inside the bend and sweeps down to the left.', 'El segundo trazo empieza dentro del doblez y baja hacia la izquierda.')],
      ['マ', hint('The second stroke is a small tick at the bottom right, under the bend.', 'El segundo trazo es una marca pequeña abajo a la derecha, bajo el doblez.')],
    ],
  },
  {
    id: 'chi-te', script: 'katakana', chars: [
      ['チ', hint('The top stroke slants down to the left.', 'El trazo de arriba baja inclinado hacia la izquierda.')],
      ['テ', hint('The top stroke is a short, level bar.', 'El trazo de arriba es una barra corta y horizontal.')],
    ],
  },
  {
    id: 'no-me', script: 'katakana', chars: [
      ['ノ', hint('One stroke alone, sweeping down to the left.', 'Un solo trazo que baja hacia la izquierda.')],
      ['メ', hint('A second stroke crosses the first, making an X.', 'Un segundo trazo cruza el primero y forma una X.')],
    ],
  },
  {
    id: 'ra-wo-fu', script: 'katakana', chars: [
      ['ラ', hint('A short level bar sits above the bend, apart from it.', 'Una barra corta y horizontal está sobre el doblez, separada.')],
      ['ヲ', hint('A second bar runs across the middle, inside the bend: three strokes.', 'Una segunda barra cruza el medio, dentro del doblez: tres trazos.')],
      ['フ', hint('Only the bend, with nothing above it or across it.', 'Solo el doblez, sin nada arriba ni cruzándolo.')],
    ],
  },
].map((set) => Object.freeze({ ...set, chars: Object.freeze(set.chars.map((c) => Object.freeze(c))) })));

/** Every kana in a set, once each, in set order. */
export function kanaInSets(sets = KANA_SETS) {
  return [...new Set(sets.flatMap((s) => s.chars.map(([ch]) => ch)))];
}
