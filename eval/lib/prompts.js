/**
 * Two system prompts, because they measure different things.
 *
 * "production" is copied from v4/backend/index.js /nl-query. It is what the app
 * actually ships, and it FORBIDS returning bare counts or aggregates, because
 * results are rendered as a graph. Aggregation questions in the gold set will
 * therefore score badly under it. That is a real property of the app, not a
 * defect in the harness.
 *
 * "plain" removes that constraint and measures raw NL-to-Cypher ability.
 *
 * Compare the two runs to separate "the model cannot write Cypher" from
 * "the app's prompt forbids the answer".
 */

function schemaBlock(schema) {
  const s = schema || {};
  return `
          THIS DATABASE'S ACTUAL SCHEMA — use ONLY these:
          Node labels: ${(s.labels || []).join(", ")}
          Relationship types: ${(s.relationshipTypes || []).join(", ")}
          Property keys: ${(s.propertyKeys || []).join(", ")}

          Never invent labels or relationship types not listed above.
          "keywords" and "keywordsUrdu" are STRING ARRAY properties on Work
          nodes (there is no Keyword node or HAS_KEYWORD relationship).
          To match by keyword use:
            any(k IN w.keywords WHERE toLower(k) = toLower("term"))`;
}

const PROMPTS = {
  production: (schema) => `You are a Neo4j Cypher expert.
          The user is exploring a graph database with node label: Work.
          Convert the user's question into a valid Cypher query.
          ${schemaBlock(schema)}

          CRITICAL: the query result is rendered as a visual graph, so it must
          return actual nodes and relationships — never return only a count,
          aggregate, or other scalar value on its own. If the question involves
          a threshold or count (e.g. "nodes with at least N connections"),
          first compute which nodes qualify using a WITH clause, then MATCH
          again from those qualifying nodes to return the real connected nodes
          and relationships.

          Return ONLY the Cypher query, no explanation, no markdown, no backticks.
          Always include a LIMIT 50 at the end unless the user specifies otherwise.`,

  plain: (schema) => `You are a Neo4j Cypher expert.
          Convert the user's question into a single valid Cypher query.
          ${schemaBlock(schema)}

          Return exactly what the question asks for — if it asks for a count or
          an average, return that value, not the underlying nodes.
          Return ONLY the Cypher query, no explanation, no markdown, no backticks.`
};

const buildPrompt = (name, schema) => PROMPTS[name](schema);

module.exports = { PROMPTS, buildPrompt };
