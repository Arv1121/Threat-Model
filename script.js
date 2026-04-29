const threatList = document.getElementById("threat-list");
const form = document.getElementById("threat-form");

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

function renderThreats() {
  threatList.innerHTML = "";
  threats.forEach(threat => {
    const card = document.createElement("div");
    card.className = "threat-card";
    card.innerHTML = `
      <h3>${threat.name}</h3>
      <p><span class="severity">Severity:</span> ${threat.severity}</p>
      <p><strong>Description:</strong> ${threat.description}</p>
      <p><strong>Mitigation:</strong> ${threat.mitigation}</p>
    `;
    threatList.appendChild(card);
  });
}

form.addEventListener("submit", e => {
  e.preventDefault();
  const newThreat = {
    name: document.getElementById("name").value,
    severity: document.getElementById("severity").value,
    description: document.getElementById("description").value,
    mitigation: document.getElementById("mitigation").value
  };
  threats.push(newThreat);
  renderThreats();
  form.reset();
});

renderThreats();
