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
});
