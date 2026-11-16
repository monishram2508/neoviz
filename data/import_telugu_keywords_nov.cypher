// Nazia, 16 Nov 2026: add "Telugu, women, women's writing" to every Telugu work,
// plus keywords from the "ProseWoman Writers" sheet that the archive is missing.
// Safe to run more than once: only keywords not already present (any case) are added.

MATCH (a:Author)-[:USES_LANGUAGE]->(:Language {name: "Telugu"}), (a)-[:WROTE]->(w:Work)
WITH DISTINCT w
WITH w, [k IN ["Telugu", "women", "women's writing"]
         WHERE NOT toLower(k) IN [x IN coalesce(w.keywords, []) | toLower(x)]] AS add
WHERE size(add) > 0
SET w.keywords = coalesce(w.keywords, []) + add
RETURN count(w) AS teluguWorksUpdated;

MATCH (w:Work {title: "Nalla Poddu"})
WITH w, [k IN ["Collection", "revolution", "Caste Discrimination", "Religion", "Biography"]
         WHERE NOT toLower(k) IN [x IN coalesce(w.keywords, []) | toLower(x)]] AS add
SET w.keywords = coalesce(w.keywords, []) + add
RETURN w.title, w.keywords;

MATCH (w:Work {title: "Neelimeghalu"})
WITH w, [k IN ["Collection"]
         WHERE NOT toLower(k) IN [x IN coalesce(w.keywords, []) | toLower(x)]] AS add
SET w.keywords = coalesce(w.keywords, []) + add
RETURN w.title, w.keywords;
