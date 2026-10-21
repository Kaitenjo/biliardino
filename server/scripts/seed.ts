import { SEED_PASSWORD, seedDatabase } from '../src/db/seed.ts';

/*
  Imports the players and their availability of the previous project (server/seed/): see src/db/seed.ts. The server does
  it by itself when it starts on a database with no players; this script is for doing it on purpose.
    npm run seed               # only into a database with no players
    npm run seed -- --reset    # empties the database first (matches included)
*/
const result = seedDatabase(process.argv.includes('--reset'));
console.log(result
  ? `Importati ${result.players} giocatori (password "${SEED_PASSWORD}") e ${result.availability} disponibilità.`
  : 'Il database contiene già dei giocatori: usa "npm run seed -- --reset" per svuotarlo e reimportare.');
