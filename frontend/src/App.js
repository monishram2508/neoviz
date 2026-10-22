import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ConfigurationPage from "./CypherQueryTester/Configuration";
import CypherQueryTester from "./CypherQueryTester/CypherQueryTester";
import JsonImport from "./CypherQueryTester/JsonImport";
import Login from "./Auth/Login";
import Register from "./Auth/Register";
import NotFound from "./NotFound";
import Layout from "./archive/Layout";
import Home from "./archive/Home";
import About from "./archive/About";
import Authors from "./archive/Authors";
import Author from "./archive/Author";
import Works from "./archive/Works";
import Work from "./archive/Work";
import "./theme";

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/authors" element={<Authors />} />
          <Route path="/authors/:slug" element={<Author />} />
          <Route path="/works" element={<Works />} />
          <Route path="/works/:slug" element={<Work />} />
        </Route>

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/configuration" element={<ConfigurationPage />} />
        <Route path="/cypherquerytester" element={<CypherQueryTester />} />
        <Route path="/import-json" element={<JsonImport />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
