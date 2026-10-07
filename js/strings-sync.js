// Sign-in and sync's strings, { en, es }, merged into strings.js's table.
// The line on My kanji that says where the data lives (render-sync.js), the
// question asked when another account signs in, and the two leads that say
// where things are kept. The Auth Kit's own strings (its button, its dialog)
// are the kit's, and follow <html lang>.

export const SYNC_STRINGS = Object.freeze({
  syncLocal: { en: 'Kept in this browser.', es: 'Se guardan en este navegador.' },
  syncSignedOut: {
    en: 'Kept in this browser. Sign in to keep your kanji, saved phrases and scores on every device.',
    es: 'Se guardan en este navegador. Inicia sesión para conservar tus kanji, tus frases guardadas y tus puntajes en todos tus dispositivos.',
  },
  syncSignIn: { en: 'Sign in', es: 'Iniciar sesión' },
  syncSyncing: { en: 'Syncing with {name}\'s account.', es: 'Sincronizando con la cuenta de {name}.' },
  syncSynced: {
    en: 'Synced to {name}\'s account. Last synced {when}.',
    es: 'Se sincroniza con la cuenta de {name}. Última sincronización: {when}.',
  },
  syncToday: { en: 'today at {time}', es: 'hoy a las {time}' },
  syncOn: { en: '{day} at {time}', es: 'el {day} a las {time}' },
  syncPaused: {
    en: 'Signed in as {name}. Nothing syncs until you choose what to do with the kanji, phrases and scores in this browser.',
    es: 'Sesión iniciada como {name}. Nada se sincroniza hasta que elijas qué hacer con los kanji, las frases y los puntajes de este navegador.',
  },
  syncChoose: { en: 'Choose', es: 'Elegir' },
  syncOffline: {
    en: 'Could not sync with {name}\'s account: this browser is offline. Everything is still kept here, and Yomu tries again.',
    es: 'No se pudo sincronizar con la cuenta de {name}: este navegador no tiene conexión. Todo sigue guardado aquí, y Yomu lo intentará de nuevo.',
  },
  syncFailed: {
    en: 'Could not sync with {name}\'s account ({detail}). Everything is still kept here, and Yomu tries again.',
    es: 'No se pudo sincronizar con la cuenta de {name} ({detail}). Todo sigue guardado aquí, y Yomu lo intentará de nuevo.',
  },
  // The sign-in dialog's lede: index.html's <meta name="neo-auth-reason">
  // carries it as data-ui-content, so a language switch relabels it.
  authReason: {
    en: 'Sign in to keep your kanji, saved phrases and scores on every device. With no account, everything stays in this browser.',
    es: 'Inicia sesión para conservar tus kanji, tus frases guardadas y tus puntajes en todos tus dispositivos. Sin cuenta, todo se queda en este navegador.',
  },

  // Another account signed in on a browser that synced with one before.
  syncAskTitle: { en: 'This browser synced with another account', es: 'Este navegador se sincronizó con otra cuenta' },
  syncAskBody: {
    en: '{name} just signed in. The kanji, saved phrases and scores in this browser came from the account it synced with before.',
    es: '{name} acaba de iniciar sesión. Los kanji, las frases guardadas y los puntajes de este navegador vienen de la cuenta con la que se sincronizó antes.',
  },
  syncAskCounts: {
    en: 'In {name}\'s account: saved kanji {kanji}, saved phrases {phrases}. In this browser: saved kanji {hereKanji}, saved phrases {herePhrases}.',
    es: 'En la cuenta de {name}: kanji guardados {kanji}, frases guardadas {phrases}. En este navegador: kanji guardados {hereKanji}, frases guardadas {herePhrases}.',
  },
  syncAskHow: {
    en: 'Adding keeps both: this browser\'s data joins the account. Using the account\'s data replaces what this browser holds; the account it synced with before keeps its own copy.',
    es: 'Añadir conserva ambos: los datos de este navegador se suman a la cuenta. Usar los datos de la cuenta reemplaza lo que tiene este navegador; la cuenta con la que se sincronizó antes conserva su propia copia.',
  },
  syncAdd: { en: 'Add this browser\'s data', es: 'Añadir los datos de este navegador' },
  syncUse: { en: 'Use the account\'s data', es: 'Usar los datos de la cuenta' },
  syncNotNow: { en: 'Not now', es: 'Ahora no' },

  // Where things are kept, once this browser syncs with an account.
  clearBodySynced: {
    en: 'This forgets every saved kanji, its review schedule and every count of the kanji you met, in this browser and in the account it syncs with, so every device signed in to that account empties too when it next syncs. History is not touched. Export first to keep a copy.',
    es: 'Esto olvida cada kanji guardado, su calendario de repaso y cada conteo de los kanji que viste, en este navegador y en la cuenta con la que se sincroniza, así que cada dispositivo con esa cuenta también queda vacío al sincronizarse. El historial no se toca. Exporta antes para guardar una copia.',
  },
  playLeadSynced: {
    en: 'Four short games with the characters that look alike. Your best scores are kept in this browser and in your account.',
    es: 'Cuatro juegos cortos con los caracteres que se parecen. Tus mejores puntajes se guardan en este navegador y en tu cuenta.',
  },
});
