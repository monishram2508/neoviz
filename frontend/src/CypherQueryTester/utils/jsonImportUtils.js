
export const validateJson = (obj) => {
  if (!obj || typeof obj !== "object") {
    throw new Error("JSON must be an object");
  }

  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.relationships)) {
    throw new Error("JSON must contain nodes[] and relationships[]");
  }

  const idSet = new Set();

  obj.nodes.forEach((n, idx) => {
    if (!n.tempId || !n.label) {
      throw new Error(`Node at index ${idx} missing tempId or label`);
    }
    if (idSet.has(n.tempId)) {
      throw new Error(`Duplicate tempId: ${n.tempId}`);
    }
    idSet.add(n.tempId);
    if (n.properties && typeof n.properties !== "object") {
      throw new Error(`Node properties must be an object (tempId: ${n.tempId})`);
    }
  });

  obj.relationships.forEach((r, idx) => {
    if (!r.from || !r.to || !r.type) {
      throw new Error(`Relationship at index ${idx} missing from/to/type`);
    }
    if (!idSet.has(r.from) || !idSet.has(r.to)) {
      throw new Error(
        `Relationship references unknown tempId (${r.from} → ${r.to})`
      );
    }
    if (r.properties && typeof r.properties !== "object") {
      throw new Error("Relationship properties must be an object");
    }
  });
};

export const toCypherMap = (obj) => {
  if (!obj || Object.keys(obj).length === 0) return "{}";
  const pairs = Object.entries(obj).map(([k, v]) => {
    const val = typeof v === "string" ? `"${v.replace(/"/g, '\\"')}"` : v;
    return `${k}: ${val}`;
  });
  return `{${pairs.join(", ")}}`;
};

export const generateCypher = (parsed) => {
  if (!parsed) return "";

  const nodeLines = parsed.nodes.map((n) => {
    const entries = Object.entries(n.properties || {});
    if (entries.length === 0) {
      throw new Error(`Node ${n.tempId} has no properties to merge on`);
    }

    const [key, value] = entries[0];
    const val = typeof value === "string" ? `"${value.replace(/"/g, '\\"')}"` : value;

    return `
MERGE (${n.tempId}:${n.label} { ${key}: ${val} })
SET ${n.tempId} += ${toCypherMap(n.properties)}
`;
  });

  const relLines = parsed.relationships.map(
    (r) => `
MERGE (${r.from})-[rel_${r.from}_${r.to}:${r.type}]->(${r.to})
SET rel_${r.from}_${r.to} += ${toCypherMap(r.properties || {})}
`
  );

  return `
${nodeLines.join("\n")}
WITH ${parsed.nodes.map((n) => n.tempId).join(", ")}
${relLines.join("\n")}
`;
};
