// The Translation section's strings (render-translate.js), { en, es }, kept
// apart from strings.js so both stay under the 500-line rule and merged into
// the same table. Spanish is neutral.

export const READER_STRINGS = Object.freeze({
  translation: { en: 'Translation', es: 'Traducción' },
  translateHere: { en: 'Translate here', es: 'Traducir aquí' },
  translateLeadDownload: {
    en: 'The first time, your browser downloads a Japanese translation model. After that the translation is made on this device, and the text is not sent anywhere.',
    es: 'La primera vez, tu navegador descarga un modelo de traducción del japonés. Después la traducción se hace en este dispositivo y el texto no se envía a ninguna parte.',
  },
  translateLead: {
    en: 'Made on this device by your browser: the text is not sent anywhere.',
    es: 'La hace tu navegador en este dispositivo: el texto no se envía a ninguna parte.',
  },
  translateUnsupported: {
    en: 'A translation on this page needs Chrome or Edge on a computer. DeepL and Google Translate above open in a new tab.',
    es: 'Para traducir en esta página hace falta Chrome o Edge en una computadora. DeepL y Google Traductor, arriba, se abren en una pestaña nueva.',
  },
  translateUnavailable: {
    en: 'This browser cannot translate Japanese on this device. DeepL and Google Translate above open in a new tab.',
    es: 'Este navegador no puede traducir japonés en este dispositivo. DeepL y Google Traductor, arriba, se abren en una pestaña nueva.',
  },
  translateDownloading: {
    en: 'Downloading the translation model: {n}%',
    es: 'Descargando el modelo de traducción: {n} %',
  },
  translating: { en: 'Translating on this device.', es: 'Traduciendo en este dispositivo.' },
  translateNote: {
    en: 'Machine translation, made on this device. It can be wrong.',
    es: 'Traducción automática, hecha en este dispositivo. Puede equivocarse.',
  },
  translateHide: { en: 'Hide', es: 'Ocultar' },
  translateFailed: { en: 'The translation failed: {detail}', es: 'La traducción falló: {detail}' },
  translateRetry: { en: 'Try again', es: 'Intentar de nuevo' },
  translateNeedsClick: {
    en: 'Your browser asks for a click before it starts translating. Press Try again.',
    es: 'Tu navegador pide un clic antes de empezar a traducir. Haz clic en Intentar de nuevo.',
  },
  translateBusy: {
    en: 'Your browser could not translate just now; it may be busy translating in other tabs. Try again in a moment, or use DeepL or Google Translate above.',
    es: 'Tu navegador no pudo traducir en este momento; quizá está ocupado traduciendo en otras pestañas. Vuelve a intentarlo en un momento, o usa DeepL o Google Traductor, arriba.',
  },
  translateStalled: {
    en: 'Your browser\'s translator stopped answering: no translation and no download progress for {s} seconds.',
    es: 'El traductor de tu navegador dejó de responder: ni traducción ni avance de la descarga en {s} segundos.',
  },
});
