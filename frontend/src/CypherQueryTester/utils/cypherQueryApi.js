import { apiUrl } from "../../api";

const QUERY_API_URL = apiUrl("query");

export const runCypherQuery = async ({ cypher, uri, username, password }) => {
  const token = localStorage.getItem("token");

  const response = await fetch(QUERY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      cypher,
      uri,
      username,
      password
    })
  });

  return response.json();
};

export const fetchDynamicMenuOptions = async ({ nodeLabel, uri, username, password }) => {
  if (!nodeLabel) return null;

  try {
    const cypher = `
      MATCH (n:\`${nodeLabel}\`)-[r]->()
      RETURN DISTINCT type(r) AS relType, 'OUTGOING' AS direction
      UNION
      MATCH (n:\`${nodeLabel}\`)<-[r]-()
      RETURN DISTINCT type(r) AS relType, 'INCOMING' AS direction
    `;

    const result = await runCypherQuery({
      cypher,
      uri,
      username,
      password
    });

    console.log("Backend response:", result);

    const dataArray = Array.isArray(result) ? result : [];

    return dataArray.
    map((record) => {
      const relType = record.relType;
      const direction = record.direction;

      if (!relType || !direction) return null;

      return {
        value: `${relType}-${direction}`,
        label: `${relType} (${direction})`,
        query: `MATCH (n:\`${nodeLabel}\`)${
        direction === "OUTGOING" ? "-[r:" : "<-[r:"}${
        relType}]${direction === "OUTGOING" ? "->(m)" : "-(m)"} RETURN n, r, m LIMIT 10`
      };
    }).
    filter(Boolean);
  } catch (error) {
    console.error("Error fetching dynamic menu options:", error);
    return null;
  }
};

export const fetchFullGraphData = async ({ uri, username, password }) => {
  return runCypherQuery({
    cypher: "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100",
    uri,
    username,
    password
  });
};
