import React from "react";

const threats = [
  {
    name: "SQL Injection",
    severity: "High",
    description: "Attackers can manipulate queries to access or modify data.",
    mitigation: "Use parameterized queries and ORM frameworks."
  },
  {
    name: "Cross-Site Scripting (XSS)",
    severity: "Medium",
    description: "Injection of malicious scripts into web pages viewed by users.",
    mitigation: "Escape user input, use CSP headers."
  },
  {
    name: "Weak Authentication",
    severity: "High",
    description: "Poor password policies or lack of MFA.",
    mitigation: "Enforce strong password rules, enable multi-factor authentication."
  }
];

function ThreatCard({ threat }) {
  return (
    <div className="card">
      <h3>{threat.name}</h3>
      <p><strong>Severity:</strong> {threat.severity}</p>
      <p><strong>Description:</strong> {threat.description}</p>
      <p><strong>Mitigation:</strong> {threat.mitigation}</p>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="container">
      <header>
        <h1>Threat Model Dashboard</h1>
        <p>Identify, classify, and mitigate risks</p>
      </header>
      <h2>Threats</h2>
      {threats.map((t, i) => <ThreatCard key={i} threat={t} />)}
    </div>
  );
}
