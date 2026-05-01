from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def index():
    threats = [
        {
            "name": "SQL Injection",
            "severity": "High",
            "description": "Attackers can manipulate queries to access or modify data.",
            "mitigation": "Use parameterized queries and ORM frameworks."
        },
        {
            "name": "Cross-Site Scripting (XSS)",
            "severity": "Medium",
            "description": "Injection of malicious scripts into web pages viewed by users.",
            "mitigation": "Escape user input, use CSP headers."
        },
        {
            "name": "Weak Authentication",
            "severity": "High",
            "description": "Poor password policies or lack of MFA.",
            "mitigation": "Enforce strong password rules, enable multi-factor authentication."
        }
    ]
    return render_template("index.html", threats=threats)

if __name__ == "__main__":
    app.run(debug=True)
