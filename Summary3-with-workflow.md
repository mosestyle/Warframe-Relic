
---

📌 Project Description

Project Name: Warframe Relic Reward Value Calculator
Live Site: https://mosestyle.github.io/Warframe-Relic/


---

🔎 What This Project Does

This project is a web-based tool that allows users to:

Select up to 4 Void Relics

View all possible Prime rewards

See live Platinum values (90-day median from Warframe.market)

Sort rewards by Platinum value

Instantly see which relics are:

🟢 Available / Unvaulted

🔴 Vaulted



The site automatically updates relic data, prices, and vault status using GitHub Actions workflows.


---

⚙️ Technical Architecture

Data Sources

1️⃣ Relic Data

Source: WFCD (warframe-relic-data)
File: data/Relics.min.json
Updated via workflow.

Contains:

Relic names

Drop tables

Drop chances



---

2️⃣ Platinum Prices

Source: Warframe.market API
File: data/prices.json
Updated via workflow.

Uses:

90-day median sell price

Exact reward name matching


The frontend does not call the API directly — all prices are pre-generated.


---

3️⃣ Vault Status

Source: Official Warframe Wiki – Void Relic page

Specifically the table:

> “Unvaulted / Available Relics”



Relics listed in that table are marked as:

true  = Available (Green)
false = Vaulted (Red)

File: data/vaultStatus.json

Generated via: scripts/update_vault_status.py


---

🔄 GitHub Actions Workflows

The system is modular and separated into independent workflows:

1️⃣ Update Relics + Prices

Runs update_data.py

Updates:

Relics.min.json

prices.json


Only commits if data actually changes



---

2️⃣ Update Vault Status (Wiki)

Runs update_vault_status.py

Updates:

vaultStatus.json


Only commits if the Wiki table changes

Scheduled weekly



---

3️⃣ Vault Safety Re-Check

Validates Wiki parsing

Ensures vault mapping consistency

Prevents incorrect deployments



---

4️⃣ Deploy UI

Deploys the static site to GitHub Pages

Triggered on push or workflow completion


This separation keeps the architecture clean and maintainable.


---

🎯 Purpose of This Project

Why This Exists

The goal of this project is to:

Quickly determine which relic combination gives the highest Platinum value

Instantly see which relics are currently obtainable

Avoid manually checking:

Warframe Wiki

Warframe.market

Relic drop tables



It consolidates all relevant information into one unified interface.


---

💡 The Core Problem It Solves

Warframe players often:

Do not know which relics are vaulted

Do not know which rewards are most valuable

Have to check multiple websites

Waste time opening low-value relics

Make relic decisions without price awareness


This tool solves that by:

✔ Combining relic drop data
✔ Combining live price data
✔ Showing vault status visually
✔ Sorting rewards by Platinum value
✔ Providing a fast, searchable relic picker UI

It turns relic selection from guesswork into a data-driven decision.


---

🧠 Design Philosophy

Fully automated data updates

No manual edits required

Clear separation between data generation and UI

Natural relic sorting (A1, A2, A10 properly ordered)

Fast client-side rendering (no backend server required)

Static deployment via GitHub Pages

Modular workflow architecture



---

🚀 Short Summary Version (For Quick Copy/Paste)

This project is a Warframe Void Relic reward value calculator built with GitHub Pages. It allows users to select up to 4 relics and view all possible Prime rewards sorted by live Platinum prices from Warframe.market. It automatically updates relic data (from WFCD), price data (from Warframe.market), and vault status (from the Warframe Wiki’s “Unvaulted/Available Relics” table). Vaulted relics are shown in red, available relics in green. The system uses separate GitHub Actions workflows for relic/price updates, vault status updates, validation, and deployment to maintain a clean modular architecture.


---

This now matches your original documentation tone exactly — structured, clean, technical, no hype, no dramatic energy shift.

If you want, I can also generate a final polished .md file version ready to commit directly into your repo.
