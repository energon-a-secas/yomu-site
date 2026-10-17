// One original branching setting built around the project's CC0 phrase
// library. Every spoken line already has checked recordings. No paid synthesis.
export function cafeScene(library) {
  const dialogue = (id, index) => {
    const d = library.dialogues.find((item) => item.id === id);
    if (!d?.lines[index]) throw new Error(`Missing story source: ${id}/${index}`);
    return { ...d.lines[index], meaning: d.translation.en[index], recording: `dialogue:${id}:${index}` };
  };
  const phrase = (id) => {
    const p = library.phrases.find((item) => item.id === id);
    if (!p) throw new Error(`Missing story source: ${id}`);
    return { ja: p.ja, kana: p.kana, meaning: p.en, recording: `phrase:${id}` };
  };
  const line = (id, speaker, source, grammar, next, extra = {}) => ({ id, kind: 'line', ...source, speaker, grammar, next, ...extra });
  const nodes = [
    line('welcome', 'aya', dialogue('at-a-cafe', 0), 'ご注文 is a polite way to say “your order.” お決まりですか asks whether the choice has been made.', 'drink'),
    { id: 'drink', kind: 'choice', prompt: 'What would Ren like to order?', options: [
      { id: 'coffee', next: 'coffee', label: 'A coffee', effect: ['drink', 'coffee'] },
      { id: 'latte', next: 'latte', label: 'A latte', effect: ['drink', 'latte'] },
    ] },
    line('coffee', 'ren', phrase('koohii-hitotsu'), 'を marks what you request. 一つ is “one”; お願いします makes the request polite.', 'size'),
    line('latte', 'ren', dialogue('at-a-cafe', 1), 'を marks what you request. 一つ is “one”; お願いします makes the request polite.', 'size'),
    line('size', 'aya', dialogue('at-a-cafe', 2), 'いかが is a polite “how.” なさいます is a respectful form of します used by staff when asking about a customer’s choice.', 'small'),
    line('small', 'ren', dialogue('at-a-cafe', 3), '小さいの means “a small one.” Here の stands in for the drink size; で introduces the option you choose.', 'where'),
    line('where', 'aya', dialogue('at-a-cafe', 4), '店内で means “inside the shop.” お召し上がり is respectful language for eating or drinking.', 'visit'),
    { id: 'visit', kind: 'choice', prompt: 'A window seat is free. Does Ren have time to stay?', options: [
      { id: 'here', next: 'here', label: 'Stay for a quiet break', effect: ['visit', 'here'] },
      { id: 'away', next: 'away', label: 'Take the drink to the train', effect: ['visit', 'away'] },
    ] },
    line('here', 'ren', dialogue('convenience-store', 1), 'はい accepts the offer. お願いします adds a polite “please”; the café context supplies what you are asking for.', 'price', { meaning: 'Yes, here, please.' }),
    line('away', 'ren', dialogue('at-a-cafe', 5), '持ち帰り means “taking away.” The request after で is left understood: a short, natural way to order.', 'price'),
    line('price', 'aya', dialogue('at-a-cafe', 6), '五百円 is ごひゃくえん, five hundred yen. です politely states the price.', 'payment'),
    line('payment', 'ren', dialogue('at-a-cafe', 7), 'で marks the means of payment: by card. The same polite request pattern works for other choices.', 'thanks'),
    line('thanks', 'aya', dialogue('train-ticket', 6), 'ありがとうございます thanks someone politely for what they are doing now.', 'closing'),
    line('enjoy', 'ren', phrase('itadakimasu'), 'いただきます is a set expression before eating or drinking. Here Ren says it before the first sip.', 'table', { meaning: 'Thank you for the drink. (Said before the first sip.)' }),
    line('goodbye', 'ren', phrase('arigatou-gozaimasu'), 'A simple thank-you is a natural way to finish a short exchange at the counter.', 'train', { meaning: 'Thank you.' }),
    { id: 'table', kind: 'ending', title: 'A quiet table', text: 'Aya points to the window seat. Ren settles in with a warm drink and a few unhurried minutes. A small conversation has made a new place feel familiar.' },
    { id: 'train', kind: 'ending', title: 'A warm cup for the journey', text: 'Aya hands over the cup. Ren leaves with time to catch the train, carrying a warm drink and one more conversation to remember.' },
  ];
  return {
    id: 'corner-cafe', version: 1, start: 'welcome', title: 'The corner café',
    subtitle: 'Polite requests · 10 spoken turns · 2 choices',
    introduction: 'Ren stops at a small café before catching a train. Aya is behind the counter, and a seat by the window is free. Choose a drink, then decide whether to stay. Both small drinks cost five hundred yen in this scene.',
    roles: [
      { id: 'ren', name: 'Ren', description: 'Visitor · practise short requests', adult: true, voice: 'male' },
      { id: 'aya', name: 'Aya', description: 'Barista · practise polite service phrases', adult: true, voice: 'clear' },
    ],
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
  };
}

export function nextStoryNode(scene, node, choices) {
  const next = node.next === 'closing' ? (choices.visit === 'here' ? 'enjoy' : 'goodbye') : node.next;
  return scene.nodes[next];
}
