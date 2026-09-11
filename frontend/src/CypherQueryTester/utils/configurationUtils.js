const API_BASE_URL = "http://localhost:3001";

const buildAuthHeaders = () => {
  const token = localStorage.getItem("token");

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
};

export const fetchSavedConnections = async () => {
  const response = await fetch(`${API_BASE_URL}/connections`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`
    }
  });

  return response.json();
};

export const fetchConnectionLabels = async ({ uri, username, password }) => {
  const response = await fetch(`${API_BASE_URL}/connect`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      uri,
      username,
      password
    })
  });

  const data = await response.json();
  return { response, data };
};

export const saveConnectionRecord = async ({ uri, username, password, name }) => {
  return fetch(`${API_BASE_URL}/save-connection`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      uri,
      username,
      password,
      name
    })
  });
};

export const sendContributionText = async ({ text }) => {
  const response = await fetch(`${API_BASE_URL}/sendContribution`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({ text })
  });

  return response.json();
};

export const runConfigurationQuery = async ({ cypher, uri, username, password }) => {
  const response = await fetch(`${API_BASE_URL}/query`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      cypher,
      uri,
      username,
      password
    })
  });

  const data = await response.json();
  return { response, data };
};

export const buildNodeConfigQuery = ({ configLabel, nodeProperties }) => {
  const propsString = Object.entries(nodeProperties).
  filter(([_, value]) => value !== "").
  map(([key, value]) => `${key}: "${value.replace(/"/g, '\\\"')}"`).
  join(", ");

  return `CREATE (n:${configLabel} { ${propsString} }) RETURN n`;
};

export const buildRelationshipConfigQuery = ({
  relNode1Label,
  relNode1Prop,
  relNode2Label,
  relNode2Prop,
  configLabel
}) => {
  return `
          MATCH (a:${relNode1Label} {${relNode1Prop}}), (b:${relNode2Label} {${relNode2Prop}})
          CREATE (a)-[:${configLabel}]->(b)
          RETURN a, b
        `;
};
