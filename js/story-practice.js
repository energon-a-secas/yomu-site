// Versioned, local story progression. Completion records choices and a
// learner's own attempts, never a pronunciation or fluency assessment.
// The scene's words are { en, es } (story-cafe.js); view() resolves them to
// the current language (strings.js useLang), so the document stays the same
// whichever language reads it.
import { t } from './strings.js';
import { nextStoryNode } from './story-cafe.js';

/** A scene's { en, es } in the current language; a missing value stays missing. */
const say = (v) => (v == null ? v : t(v));

export class StoryPractice {
  constructor(scene, document) {
    this.scene = scene;
    this.role = scene.roles[0].id;
    this.path = [];
    this.started = false;
    this.endings = [];
    this.recovered = false;
    if (document == null) return;
    if (document.v !== 1 || document.scene !== scene.id || document.sceneVersion !== scene.version || !Array.isArray(document.path) || !Array.isArray(document.endings) || typeof document.started !== 'boolean') {
      this.recovered = true; return;
    }
    this.role = scene.roles.some((r) => r.id === document.role) ? document.role : this.role;
    if (this.role !== document.role) this.recovered = true;
    this.started = document.started;
    this.endings = [...new Set(document.endings.filter((id) => scene.nodes[id]?.kind === 'ending'))];
    // Preserve a valid prefix when a future/corrupt record breaks the path.
    for (const record of document.path.slice(0, 32)) {
      const { node } = this.walk();
      const valid = record && record.id === node?.id && (
        (node.kind === 'line' && ['tried', 'skipped'].includes(record.status)) ||
        (node.kind === 'choice' && node.options.some((o) => o.id === record.choice))
      );
      if (!valid || !this.started) { this.recovered = true; break; }
      this.path.push(node.kind === 'line' ? { id: node.id, status: record.status } : { id: node.id, choice: record.choice });
    }
    if (document.path.length > 32) this.recovered = true;
    this.rememberEnding();
  }

  walk() {
    let node = this.scene.nodes[this.scene.start];
    const choices = {};
    for (const record of this.path) {
      if (node.kind === 'choice') {
        const option = node.options.find((o) => o.id === record.choice);
        choices[option.effect[0]] = option.effect[1];
        node = this.scene.nodes[option.next];
      } else node = nextStoryNode(this.scene, node, choices);
    }
    return { node, choices };
  }

  start(role = this.role, restart = false) {
    if (this.started && this.walk().node.kind !== 'ending' && !restart) {
      throw new Error(t({ en: 'Resume or restart the current scene.', es: 'Retoma la escena actual o empiézala de nuevo.' }));
    }
    if (!this.scene.roles.some((r) => r.id === role)) throw new Error(t({ en: 'Choose one of the scene roles.', es: 'Elige uno de los papeles de la escena.' }));
    this.role = role; this.path = []; this.started = true;
    return this.view();
  }

  act(action, { id, choice, role, status = 'skipped' } = {}) {
    if (action === 'role' && this.scene.roles.some((r) => r.id === role)) this.role = role;
    if (!this.started) return this.view();
    const { node } = this.walk();
    // A double tap or an older asynchronous screen cannot advance a new turn.
    if (id !== node.id) return this.view();
    if (action === 'continue' && node.kind === 'line' && ['tried', 'skipped'].includes(status)) this.path.push({ id, status });
    if (action === 'choose' && node.kind === 'choice' && node.options.some((o) => o.id === choice)) this.path.push({ id, choice });
    this.rememberEnding();
    return this.view();
  }

  rememberEnding() {
    const { node } = this.walk();
    if (this.started && node.kind === 'ending' && !this.endings.includes(node.id)) this.endings.push(node.id);
  }

  line(node) {
    return { id: node.id, speaker: node.speaker, ja: node.ja, kana: node.kana, meaning: say(node.meaning), grammar: say(node.grammar), recording: node.recording };
  }

  view() {
    const { node, choices } = this.walk();
    const lines = this.path.filter((r) => this.scene.nodes[r.id].kind === 'line');
    const current = !this.started ? null : node.kind === 'line' ? { kind: 'line', id: node.id, line: this.line(node) } : node.kind === 'choice' ? {
      kind: 'choice', id: node.id, prompt: say(node.prompt),
      options: node.options.map((o) => ({ id: o.id, label: say(o.label), ja: this.scene.nodes[o.next].ja, meaning: say(this.scene.nodes[o.next].meaning) })),
    } : { kind: 'ending', id: node.id, title: say(node.title), text: say(node.text) };
    const scene = this.scene;
    return {
      recovered: this.recovered,
      scene: {
        id: scene.id, title: say(scene.title), subtitle: say(scene.subtitle), introduction: say(scene.introduction),
        roles: scene.roles.map((r) => ({ ...r, description: say(r.description) })),
      },
      started: this.started, role: this.role, current, choices,
      turns: lines.length, tried: lines.filter((r) => r.status === 'tried').length,
      endings: this.endings.map((id) => ({ id, title: say(scene.nodes[id].title) })),
      history: lines.map((r) => ({ ...this.line(scene.nodes[r.id]), status: r.status })),
    };
  }

  dump() {
    return { v: 1, scene: this.scene.id, sceneVersion: this.scene.version, role: this.role, started: this.started, path: this.path, endings: this.endings };
  }
}
