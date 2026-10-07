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
  // A failure by its kind (account.js failureKind), never by its code: the
  // code and any Convex request id go to the console only.
  syncFailed: {
    en: 'Could not sync with {name}\'s account: the server did not answer as expected. Everything is still kept here, and Yomu tries again.',
    es: 'No se pudo sincronizar con la cuenta de {name}: el servidor no respondió como se esperaba. Todo sigue guardado aquí, y Yomu lo intentará de nuevo.',
  },
  syncFailedSignIn: {
    en: 'Could not sync with {name}\'s account: the account did not accept this sign-in. Everything is still kept here; Yomu tries again, and signing out and back in may help.',
    es: 'No se pudo sincronizar con la cuenta de {name}: la cuenta no aceptó este inicio de sesión. Todo sigue guardado aquí; Yomu lo intentará de nuevo, y cerrar sesión y volver a iniciarla puede ayudar.',
  },
  syncFailedSwitched: {
    en: 'Could not sync with {name}\'s account: another tab changed the account this browser syncs with. Everything is still kept here, and Yomu checks again.',
    es: 'No se pudo sincronizar con la cuenta de {name}: otra pestaña cambió la cuenta con la que se sincroniza este navegador. Todo sigue guardado aquí, y Yomu lo revisará de nuevo.',
  },
  syncFailedRefused: {
    en: 'Could not sync with {name}\'s account: the account refused what this browser sent. Everything is still kept here, and Yomu tries again.',
    es: 'No se pudo sincronizar con la cuenta de {name}: la cuenta rechazó lo que envió este navegador. Todo sigue guardado aquí, y Yomu lo intentará de nuevo.',
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
  // What each answer does, and no more than that. The account this browser
  // synced with before is never written to again from here: it keeps what
  // it had at its last sync, and nothing changed since reaches it.
  syncAskHow: {
    en: 'Adding keeps both: this browser\'s data joins the account that just signed in. Using the account\'s data replaces what this browser holds with that account\'s. Either way, the account this browser synced with before keeps what it already had, and nothing more: what changed in this browser since its last sync with that account (kanji and phrases saved or unsaved, reviews, scores, display settings) is not sent to it. If you use the account\'s data, those changes are gone from this browser too.',
    es: 'Añadir conserva ambos: los datos de este navegador se suman a la cuenta que acaba de iniciar sesión. Usar los datos de la cuenta reemplaza lo que tiene este navegador por lo de esa cuenta. En ambos casos, la cuenta con la que este navegador se sincronizó antes conserva lo que ya tenía, y nada más: lo que cambió en este navegador desde su última sincronización con esa cuenta (kanji y frases guardados o quitados, repasos, puntajes, ajustes de la vista) no se le envía. Si usas los datos de la cuenta, esos cambios también desaparecen de este navegador.',
  },
  syncAskSince: {
    en: 'This browser last synced with that account {when}.',
    es: 'Este navegador se sincronizó por última vez con esa cuenta {when}.',
  },
  // A first sign-in, when this browser holds saved kanji or phrases of its
  // own and the account holds data too (sync.js begin()). This browser's
  // data was never in the account, so Use loses it: the text says so.
  syncFirstTitle: { en: 'This browser has kanji and phrases of its own', es: 'Este navegador tiene kanji y frases propios' },
  syncFirstBody: {
    en: 'This browser has kanji and phrases from before you signed in. Add them to your account, or use your account\'s data here?',
    es: 'Este navegador tiene kanji y frases de antes de que iniciaras sesión. ¿Los añades a tu cuenta, o usas aquí los datos de tu cuenta?',
  },
  syncFirstHow: {
    en: 'Adding keeps both: this browser\'s kanji, phrases, reviews and scores join your account, including any your account had removed or cleared. Using your account\'s data replaces this browser\'s saved kanji, their reviews and counts, its saved phrases and its scores with your account\'s. They were never in your account, so they are gone from this browser too: to keep a copy, choose Not now and use Export in My kanji first.',
    es: 'Añadir conserva ambos: los kanji, las frases, los repasos y los puntajes de este navegador se suman a tu cuenta, incluso los que tu cuenta había quitado o borrado. Usar los datos de tu cuenta reemplaza los kanji guardados de este navegador, sus repasos y conteos, sus frases guardadas y sus puntajes por los de tu cuenta. Nunca estuvieron en tu cuenta, así que también desaparecen de este navegador: para guardar una copia, elige Ahora no y usa Exportar en Mis kanji antes.',
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
