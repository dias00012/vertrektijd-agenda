/*
 * Leeg met opzet.
 *
 * Servermodules beginnen met `import "server-only"`: dat pakket gooit een fout
 * zodra zo'n module in een client-bundel belandt, en dat is precies de bedoeling
 * -- het houdt sleutels en beheerderscontroles uit de browser.
 *
 * Alleen weigert datzelfde pakket ook dienst in de tests, die nu eenmaal geen
 * Next-server zijn. Vitest wijst `server-only` daarom hierheen. De echte
 * bescherming blijft staan waar hij hoort: in de build.
 */
export {};
