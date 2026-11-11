import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ConfigurationPage from "./CypherQueryTester/Configuration";
import CypherQueryTester from "./CypherQueryTester/CypherQueryTester";
import JsonImport from "./CypherQueryTester/JsonImport";
import NotFound from "./NotFound";
import Layout from "./archive/Layout";
import Home from "./archive/Home";
import About from "./archive/About";
import Authors from "./archive/Authors";
import Author from "./archive/Author";
import Works from "./archive/Works";
import Work from "./archive/Work";
import SignIn from "./archive/SignIn";
import Join from "./archive/Join";
import Contribute from "./archive/Contribute";
import Profile from "./archive/Profile";
import Review from "./archive/Review";
import Admin from "./archive/Admin";
import System from "./archive/System";
import { AccountProvider } from "./archive/account";
import "./theme";

function App() {
  return (
    <Router>
      <AccountProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/authors" element={<Authors />} />
            <Route path="/authors/:slug" element={<Author />} />
            <Route path="/works" element={<Works />} />
            <Route path="/works/:slug" element={<Work />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/join" element={<Join />} />
            <Route path="/contribute" element={<Contribute />} />
            <Route path="/people/:id" element={<Profile />} />
            <Route path="/review" element={<Review />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/system" element={<System />} />
          </Route>

          <Route path="/login" element={<Navigate to="/signin" replace />} />
          <Route path="/register" element={<Navigate to="/join" replace />} />

          <Route path="/configuration" element={<ConfigurationPage />} />
          <Route path="/cypherquerytester" element={<CypherQueryTester />} />
          <Route path="/import-json" element={<JsonImport />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AccountProvider>
    </Router>
  );
}

export default App;
