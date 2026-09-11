import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ConfigurationView from "./components/ConfigurationView";
import {
  fetchConnectionLabels,
  fetchSavedConnections,
  saveConnectionRecord,
} from "./utils/configurationUtils";

const ConfigurationPage = () => {
  const [uri,            setUri]            = useState("");
  const [username,       setUsername]       = useState("");
  const [password,       setPassword]       = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [nodes,          setNodes]          = useState([]);
  const [connected,      setConnected]      = useState(false);
  const [connections,    setConnections]    = useState([]);
  const [error,          setError]          = useState("");
  const [showPassword,   setShowPassword]   = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [nodesLoading,   setNodesLoading]   = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { window.location.href = "/login"; return; }

    // "Change DB" sends forceForm — show the connection form instead of auto-reconnecting.
    if (location.state?.forceForm) return;

    const savedUri      = sessionStorage.getItem("neo4j_uri");
    const savedUsername = sessionStorage.getItem("neo4j_username");
    const savedPassword = sessionStorage.getItem("neo4j_password");

    if (savedUri && savedUsername && savedPassword) {
      setUri(savedUri);
      setUsername(savedUsername);
      setPassword(savedPassword);
      setConnected(true);
      fetchLabelsWithCredentials(savedUri, savedUsername, savedPassword);
    }
  }, []);

  useEffect(() => {
    fetchSavedConnections().then((rows) => {
      setConnections(Array.isArray(rows) ? rows : []);
    }).catch(() => {});
  }, []);

  const storeLabels = (labels) => {
    sessionStorage.setItem("neo4j_labels", JSON.stringify(labels));
  };

  const fetchLabelsWithCredentials = async (u, n, p) => {
    setNodesLoading(true);
    try {
      const { response, data } = await fetchConnectionLabels({ uri: u, username: n, password: p });
      if (response.ok) {
        setNodes(data.labels.map((label) => ({ label })));
        storeLabels(data.labels);
      }
    } catch (err) {
      console.error("Error fetching labels:", err);
    } finally {
      setNodesLoading(false);
    }
  };

  const connectToNeo4j = async () => {
    setError("");
    if (!uri.trim() || !username.trim() || !password) {
      setError("Please fill in the URI, username and password.");
      return;
    }
    setLoading(true);
    try {
      const { response, data } = await fetchConnectionLabels({ uri, username, password });
      if (response.ok) {
        setNodes(data.labels.map((label) => ({ label })));
        storeLabels(data.labels);
        setConnected(true);

        sessionStorage.setItem("neo4j_uri",      uri);
        sessionStorage.setItem("neo4j_username", username);
        sessionStorage.setItem("neo4j_password", password);

        if (!connections.some((c) => c.uri === uri && c.username === username)) {
          await saveConnectionRecord({ uri, username, password, name: connectionName.trim() || uri });
          const rows = await fetchSavedConnections();
          setConnections(Array.isArray(rows) ? rows : []);
        }
      } else {
        setError(data.error || "Failed to connect. Check your credentials.");
      }
    } catch {
      setError("Failed to connect. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleSavedConnectionSelect = (connectionId) => {
    const selected = connections.find((c) => String(c.id) === String(connectionId));
    if (!selected) return;
    setUri(selected.uri);
    setUsername(selected.username);
    setPassword(selected.password || "");
    setConnectionName(selected.name || "");
  };

  const handleNodeClick = (node) => {
    localStorage.setItem("nodeLabel", node.label);
    sessionStorage.setItem("neo4j_uri",      uri);
    sessionStorage.setItem("neo4j_username", username);
    sessionStorage.setItem("neo4j_password", password);
    navigate("/cypherquerytester", {
      state: {
        selectedNode: node,
        allLabels: nodes.map((n) => n.label),
        uri, username, password,
      },
    });
  };

  const handleSwitchDb = () => {
    setConnected(false);
    setError("");
    setNodes([]);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    sessionStorage.clear();
    window.location.href = "/login";
  };

  return (
    <ConfigurationView
      connected={connected}
      onLogout={handleLogout}
      connections={connections}
      onSavedConnectionSelect={handleSavedConnectionSelect}
      connectionName={connectionName}
      onConnectionNameChange={setConnectionName}
      uri={uri}
      onUriChange={setUri}
      username={username}
      onUsernameChange={setUsername}
      password={password}
      onPasswordChange={setPassword}
      showPassword={showPassword}
      onTogglePassword={() => setShowPassword((p) => !p)}
      onConnect={connectToNeo4j}
      loading={loading}
      error={error}
      nodes={nodes}
      onNodeClick={handleNodeClick}
      nodesLoading={nodesLoading}
      onSwitchDb={handleSwitchDb}
    />
  );
};

export default ConfigurationPage;
