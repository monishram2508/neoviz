import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./JsonImport.css";
import { generateCypher, validateJson } from "./utils/jsonImportUtils";
import { apiUrl } from "../api";

export default function JsonImportPage() {
  const navigate = useNavigate();

  const [rawJson, setRawJson] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        validateJson(obj);
        setRawJson(JSON.stringify(obj, null, 2));
        setParsed(obj);
        setError("");
        setStatus("");
      } catch (err) {
        setParsed(null);
        setError(err.message || "Invalid JSON");
      }
    };
    reader.readAsText(file);
  };

  const handleJsonEdit = (value) => {
    setRawJson(value);
    try {
      const obj = JSON.parse(value);
      validateJson(obj);
      setParsed(obj);
      setError("");
    } catch (err) {
      setParsed(null);
      setError(err.message || "Invalid JSON");
    }
  };

  const pushToNeo4j = async () => {
    if (!parsed) return;

    setLoading(true);
    setStatus("");
    try {
      const uri =
      sessionStorage.getItem("neo4j_uri") || localStorage.getItem("neo4j_uri");
      const username =
      sessionStorage.getItem("neo4j_username") || localStorage.getItem("neo4j_username");
      const password =
      sessionStorage.getItem("neo4j_password") || localStorage.getItem("neo4j_password");
      const token = localStorage.getItem("token");

      if (!uri || !username || !password) {
        throw new Error("Neo4j connection not found. Please reconnect.");
      }

      const cypher = generateCypher(parsed);
      console.log("Generated Cypher:\n", cypher);

      const res = await fetch(apiUrl("query"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          cypher,
          uri,
          username,
          password
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Neo4j insertion failed");
      }

      await res.json();
      setStatus("Data inserted successfully into Neo4j");
    } catch (err) {
      setStatus("Error: " + (err.message || "Insertion failed"));
      console.log(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="json-import-container">
      <h1>Import JSON → Neo4j</h1>

      <p className="helper-text">
        Upload a JSON file containing nodes and relationships. You can edit it
        before inserting.
      </p>

      <input type="file" accept=".json" onChange={handleFileUpload} />

      <textarea
        className="json-preview"
        placeholder="JSON preview / edit area"
        value={rawJson}
        onChange={(e) => handleJsonEdit(e.target.value)} />
      

      {error && <div className="error-box">{error}</div>}

      <div className="button-row">
        <button
          disabled={!parsed || !!error || loading}
          onClick={pushToNeo4j}>
          
          {loading ? "Inserting..." : "Confirm & Insert"}
        </button>

        <button className="secondary" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      {status && <div className="status-box">{status}</div>}
    </div>);

}
