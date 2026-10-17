// The recorded voices: which ElevenLabs Voice Library voice speaks each role,
// and the models that make the clips. A role's id names its folder under
// data/audio/ and the page's choice, so swapping the voice behind a role
// keeps every learner's choice; the next run of tools/build-audio.mjs remakes
// that role's clips, since the voice id is part of each clip's signature.
//
// All four are native Japanese (ja-JP) voices verified on eleven_v4, chosen
// on 2026-10-16 from an audition of ten: each said the audition line exactly
// as Yomu reads it (checked by transcription), so the choice is of manner.

export const VOICES = Object.freeze([
  {
    id: 'clear', name: 'Konoha', voiceId: 'T7yYq3WpB94yAuOXraRi',
    label: { en: 'Clear', es: 'Clara' },
    about: 'Kanto standard, calm explainer',
  },
  {
    id: 'calm', name: 'Yuki', voiceId: 'JTlYtJrcTzPC71hMLOxo',
    label: { en: 'Calm', es: 'Serena' },
    about: 'composed, quiet and formal',
  },
  {
    id: 'bright', name: 'Kuon', voiceId: 'B8gJV1IhpuegLxdpXFOE',
    label: { en: 'Bright', es: 'Alegre' },
    about: 'cheerful anime style',
  },
  {
    id: 'male', name: 'Hiroki', voiceId: 'vzIXwvf41vKosKu00hYj',
    label: { en: 'Male', es: 'Masculina' },
    about: 'calm, precise and polite',
  },
]);

// eleven_v4 makes every clip. There are no slow takes: v4 ignores
// voice_settings.speed (a sentence came out 4.16 s at 1.0 and at 0.7), and
// multilingual_v2, which honours it, failed the check on 75 of the 252 slow
// takes of the sound examples on 2026-10-16, some as the other word of the
// pair they exist to teach (slow びょういん heard as 美容院, ビル as ビール).
// Slow plays the normal clip slowed, with its pitch kept (js/speech.js).
export const MODEL = 'eleven_v4';

// Lossless from the API, so the clip is encoded once, after it is trimmed
// and levelled (tools/lib/audio-finish.mjs).
export const RAW_FORMAT = 'pcm_24000';
export const RAW_RATE = 24000;

// Speech to text for the check (tools/lib/audio-check.mjs).
export const STT_MODEL = 'scribe_v2';
