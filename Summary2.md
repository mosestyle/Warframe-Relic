# 📌 Project Description

**Project Name:** Warframe Relic Reward Value Calculator
**Live Site:** [https://mosestyle.github.io/Warframe-Relic/](https://mosestyle.github.io/Warframe-Relic/)

---

# 🔎 What This Project Does

This project is a web-based tool that allows users to:

* Select up to **4 Void Relics**
* View **all possible Prime rewards**
* See **live Platinum values** (90-day median from Warframe.market)
* Sort rewards by Platinum value
* Instantly see which relics are:

  * 🟢 **Available / Unvaulted**
  * 🔴 **Vaulted**

All data is automatically updated using GitHub Actions workflows.

---

# 🎯 Purpose of This Project

Warframe players often need to:

* Check if a relic is vaulted
* Check current Platinum value of drops
* Compare relic combinations
* Visit multiple websites (Wiki, Warframe.market, relic lists)

This project solves that by:

✔ Combining relic drop tables
✔ Combining live market price data
✔ Automatically tracking vault status
✔ Displaying everything in one fast interface

It removes the need to manually cross-reference multiple sources.

---

# ⚙️ Technical Architecture

## 📊 Data Sources

### 1️⃣ Relic Data

Source: **WFCD (warframe-relic-data)**
Output file: `data/Relics.min.json`
Updated weekly via workflow.

Contains:

* Relic names
* Drop tables
* Drop chances

---

### 2️⃣ Platinum Prices

Source: **Warframe.market API**
Output file: `data/prices.json`
Updated weekly via workflow.

Uses:

* 90-day median sell price
* Exact reward name matching

---

### 3️⃣ Vault Status

Source: **Official Warframe Wiki – Void Relic page**

Only relics listed in the table:

> **“Unvaulted/Available Relics”**

are marked as:

```
true  = Available (Green)
false = Vaulted (Red)
```

Output file:
`data/vaultStatus.json`

Generated via:
`scripts/update_vault_status.py`

---

# 🔄 GitHub Workflows

The project uses **modular workflows**:

### 1️⃣ Update Relics + Prices (Weekly)

Runs:

```
scripts/update_data.py
```

Updates:

* Relics.min.json
* prices.json

---

### 2️⃣ Update Vault Status (Wiki)

Runs:

```
scripts/update_vault_status.py
```

Updates:

* vaultStatus.json

---

### 3️⃣ Deploy UI

Deploys the static site to GitHub Pages.

---

# 📁 Repository Structure

```
.github/workflows/
│   deploy-ui.yml
│   update-data-weekly.yml
│   update-vault-status-weekly.yml

data/
│   .gitkeep
│   Relics.min.json
│   meta.json
│   prices.json
│   vaultStatus.json

scripts/
│   missing_prices.txt
│   update_data.py
│   update_vault_status.py

README.md
Summary.md
app.js
index.html
style.css
```

---

## 📂 Structure Explanation

### `.github/workflows/`

Contains automation workflows:

* Data updates
* Vault updates
* Deployment

---

### `data/`

Contains generated JSON data used by the frontend:

* Relic data
* Price data
* Vault status data

These files are auto-generated — not manually edited.

---

### `scripts/`

Contains backend Python scripts used by workflows:

* `update_data.py` → fetch relics + prices
* `update_vault_status.py` → fetch available relics from wiki
* `missing_prices.txt` → debugging output for unmatched items

---

### Frontend Files

* `index.html` → Main UI
* `style.css` → Styling and vault coloring
* `app.js` → Logic for:

  * Relic picker
  * Price sorting
  * Vault coloring
  * Modal search

---

# 🧠 Design Philosophy

* Fully automated updates
* Modular workflow separation
* Natural relic sorting (A1, A2, A10 correctly ordered)
* No backend server required
* GitHub Pages static hosting
* Clear data separation
* Resilient to wiki changes (basic safety checks included)

---

# 🚀 Short Summary (Quick Copy Version)

This project is a Warframe Void Relic reward value calculator built with GitHub Pages. It allows users to select up to four relics and see all possible Prime rewards sorted by live Platinum prices from Warframe.market. It automatically updates relic data (from WFCD), price data (from Warframe.market), and vault status (from the Warframe Wiki’s “Unvaulted/Available Relics” table). Vaulted relics are shown in red, available relics in green. The system uses modular GitHub Actions workflows and a clean separation between data generation scripts and frontend UI.

