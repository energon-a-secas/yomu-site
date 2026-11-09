// One original branching setting built around the project's CC0 phrase
// library. Every spoken line already has checked recordings. No paid synthesis.
// What the scene says is { en, es }: a line's meaning is the library's own
// translation in each language, the rest is written here, and story-practice.js
// resolves it to the current language (strings.js useLang) in view().
export function cafeScene(library) {
  const dialogue = (id, index) => {
    const d = library.dialogues.find((item) => item.id === id);
    if (!d?.lines[index]) throw new Error(`Missing story source: ${id}/${index}`);
    return { ...d.lines[index], meaning: { en: d.translation.en[index], es: d.translation.es?.[index] }, recording: `dialogue:${id}:${index}` };
  };
  const phrase = (id) => {
    const p = library.phrases.find((item) => item.id === id);
    if (!p) throw new Error(`Missing story source: ${id}`);
    return { ja: p.ja, kana: p.kana, meaning: { en: p.en, es: p.es }, recording: `phrase:${id}` };
  };
  const line = (id, speaker, source, grammar, next, extra = {}) => ({ id, kind: 'line', ...source, speaker, grammar, next, ...extra });
  const request = {
    en: 'を marks what you request. 一つ is “one”; お願いします makes the request polite.',
    es: 'を marca lo que pides. 一つ es “uno”; お願いします vuelve cortés el pedido.',
  };
  const nodes = [
    line('welcome', 'aya', dialogue('at-a-cafe', 0), {
      en: 'ご注文 is a polite way to say “your order.” お決まりですか asks whether the choice has been made.',
      es: 'ご注文 es una forma cortés de decir “su pedido”. お決まりですか pregunta si ya se decidió qué pedir.',
    }, 'drink'),
    { id: 'drink', kind: 'choice', prompt: { en: 'What would Ren like to order?', es: '¿Qué quiere pedir Ren?' }, options: [
      { id: 'coffee', next: 'coffee', label: { en: 'A coffee', es: 'Un café' }, effect: ['drink', 'coffee'] },
      { id: 'latte', next: 'latte', label: { en: 'A latte', es: 'Un café latte' }, effect: ['drink', 'latte'] },
    ] },
    line('coffee', 'ren', phrase('koohii-hitotsu'), request, 'size'),
    line('latte', 'ren', dialogue('at-a-cafe', 1), request, 'size'),
    line('size', 'aya', dialogue('at-a-cafe', 2), {
      en: 'いかが is a polite “how.” なさいます is a respectful form of します used by staff when asking about a customer’s choice.',
      es: 'いかが es un “cómo” cortés. なさいます es una forma respetuosa de します que usa el personal al preguntar por la elección del cliente.',
    }, 'small'),
    line('small', 'ren', dialogue('at-a-cafe', 3), {
      en: '小さいの means “a small one.” Here の stands in for the drink size; で introduces the option you choose.',
      es: '小さいの significa “uno pequeño”. Aquí の ocupa el lugar del tamaño de la bebida; で presenta la opción que eliges.',
    }, 'where'),
    line('where', 'aya', dialogue('at-a-cafe', 4), {
      en: '店内で means “inside the shop.” お召し上がり is respectful language for eating or drinking.',
      es: '店内で significa “dentro del local”. お召し上がり es lenguaje respetuoso para comer o beber.',
    }, 'visit'),
    { id: 'visit', kind: 'choice', prompt: {
      en: 'A window seat is free. Does Ren have time to stay?',
      es: 'Hay un asiento libre junto a la ventana. ¿Tiene Ren tiempo para quedarse?',
    }, options: [
      { id: 'here', next: 'here', label: { en: 'Stay for a quiet break', es: 'Quedarse a descansar un rato' }, effect: ['visit', 'here'] },
      { id: 'away', next: 'away', label: { en: 'Take the drink to the train', es: 'Llevarse la bebida al tren' }, effect: ['visit', 'away'] },
    ] },
    line('here', 'ren', dialogue('convenience-store', 1), {
      en: 'はい accepts the offer. お願いします adds a polite “please”; the café context supplies what you are asking for.',
      es: 'はい acepta la oferta. お願いします agrega un “por favor” cortés; el contexto del café deja claro qué estás pidiendo.',
    }, 'price', { meaning: { en: 'Yes, here, please.', es: 'Sí, aquí, por favor.' } }),
    line('away', 'ren', dialogue('at-a-cafe', 5), {
      en: '持ち帰り means “taking away.” The request after で is left understood: a short, natural way to order.',
      es: '持ち帰り significa “para llevar”. Lo que se pide después de で queda sobrentendido: una forma corta y natural de pedir.',
    }, 'price'),
    line('price', 'aya', dialogue('at-a-cafe', 6), {
      en: '五百円 is ごひゃくえん, five hundred yen. です politely states the price.',
      es: '五百円 es ごひゃくえん, quinientos yenes. です dice el precio con cortesía.',
    }, 'payment'),
    line('payment', 'ren', dialogue('at-a-cafe', 7), {
      en: 'で marks the means of payment: by card. The same polite request pattern works for other choices.',
      es: 'で marca el medio de pago: con tarjeta. El mismo patrón de pedido cortés sirve para otras opciones.',
    }, 'thanks'),
    line('thanks', 'aya', dialogue('train-ticket', 6), {
      en: 'ありがとうございます thanks someone politely for what they are doing now.',
      es: 'ありがとうございます agradece con cortesía lo que alguien está haciendo en este momento.',
    }, 'closing'),
    line('enjoy', 'ren', phrase('itadakimasu'), {
      en: 'いただきます is a set expression before eating or drinking. Here Ren says it before the first sip.',
      es: 'いただきます es una expresión fija antes de comer o beber. Aquí Ren la dice antes del primer sorbo.',
    }, 'table', { meaning: { en: 'Thank you for the drink. (Said before the first sip.)', es: 'Gracias por la bebida. (Se dice antes del primer sorbo.)' } }),
    line('goodbye', 'ren', phrase('arigatou-gozaimasu'), {
      en: 'A simple thank-you is a natural way to finish a short exchange at the counter.',
      es: 'Un simple “gracias” es una forma natural de terminar un intercambio breve en el mostrador.',
    }, 'train', { meaning: { en: 'Thank you.', es: 'Gracias.' } }),
    { id: 'table', kind: 'ending', title: { en: 'A quiet table', es: 'Una mesa tranquila' }, text: {
      en: 'Aya points to the window seat. Ren settles in with a warm drink and a few unhurried minutes. A small conversation has made a new place feel familiar.',
      es: 'Aya señala el asiento junto a la ventana. Ren se acomoda con una bebida caliente y unos minutos sin prisa. Una pequeña conversación hizo que un lugar nuevo se sintiera familiar.',
    } },
    { id: 'train', kind: 'ending', title: { en: 'A warm cup for the journey', es: 'Una taza caliente para el viaje' }, text: {
      en: 'Aya hands over the cup. Ren leaves with time to catch the train, carrying a warm drink and one more conversation to remember.',
      es: 'Aya le entrega la taza. Ren sale con tiempo para alcanzar el tren, con una bebida caliente y una conversación más para recordar.',
    } },
  ];
  return {
    id: 'corner-cafe', version: 1, start: 'welcome',
    title: { en: 'The corner café', es: 'El café de la esquina' },
    subtitle: { en: 'Polite requests · 10 spoken turns · 2 choices', es: 'Peticiones corteses · 10 turnos hablados · 2 decisiones' },
    introduction: {
      en: 'Ren stops at a small café before catching a train. Aya is behind the counter, and a seat by the window is free. Choose a drink, then decide whether to stay. Both small drinks cost five hundred yen in this scene.',
      es: 'Ren pasa por un pequeño café antes de tomar un tren. Aya atiende detrás del mostrador, y hay un asiento libre junto a la ventana. Elige una bebida y luego decide si Ren se queda. En esta escena, las dos bebidas pequeñas cuestan quinientos yenes.',
    },
    roles: [
      { id: 'ren', name: 'Ren', description: { en: 'Visitor · practise short requests', es: 'Visitante · practica peticiones cortas' }, adult: true, voice: 'male' },
      { id: 'aya', name: 'Aya', description: { en: 'Barista · practise polite service phrases', es: 'Barista · practica frases corteses para atender' }, adult: true, voice: 'clear' },
    ],
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
  };
}

export function nextStoryNode(scene, node, choices) {
  const next = node.next === 'closing' ? (choices.visit === 'here' ? 'enjoy' : 'goodbye') : node.next;
  return scene.nodes[next];
}
