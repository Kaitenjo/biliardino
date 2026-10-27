-- La probabilità di vittoria salvata è quella dei bianchi, la prima squadra: brown_expected diventa white_expected, il
-- suo complemento.
ALTER TABLE matches RENAME COLUMN brown_expected TO white_expected;
UPDATE matches SET white_expected = 1 - white_expected;
