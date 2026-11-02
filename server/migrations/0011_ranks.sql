-- I rank dei giocatori, mostrati come bordino attorno alla loro icona: uno per riga, dal più basso al più alto. Un ELO
-- appartiene al rank più alto il cui min_elo non supera l'ELO; il più basso parte da 0. Il super admin cambia le soglie
-- dalla pagina ELO. Il bordino è l'immagine client/public/ranks/<key>.webp.
CREATE TABLE ranks (
  key      TEXT    PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE,
  label    TEXT    NOT NULL,
  min_elo  REAL    NOT NULL
);

INSERT INTO ranks (key, position, label, min_elo) VALUES
  ('sogliola', 1, 'Sogliola', 0),
  ('spigola', 2, 'Spigola', 875),
  ('tonno', 3, 'Tonno', 950),
  ('barracuda', 4, 'Barracuda', 1025),
  ('squalo', 5, 'Squalo', 1100),
  ('megalodonte', 6, 'Megalodonte', 1175);
