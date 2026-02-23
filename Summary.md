# 📌 Project Description

**Project Name:** Warframe Relic Reward Value Calculator
**Live Site:** [https://mosestyle.github.io/Warframe-Relic/](https://mosestyle.github.io/Warframe-Relic/)

## 🔎 What This Project Does

This project is a web-based tool that allows users to:

* Select up to **4 Void Relics**
* View **all possible Prime rewards**
* See **live Platinum values** (90-day median from Warframe.market)
* Sort rewards by Platinum value
* Instantly see which relics are:

  * 🟢 **Available / Unvaulted**
  * 🔴 **Vaulted**

The site automatically updates relic data, prices, and vault status using GitHub Actions workflows.

---

# ⚙️ Technical Architecture

## Data Sources

### 1️⃣ Relic Data

Source: **WFCD (warframe-relic-data)**
File: `data/Relics.min.json`
Updated weekly via workflow.

Contains:

* Relic names
* Drop tables
* Drop chances

---

### 2️⃣ Platinum Prices

Source: **Warframe.market API**
File: `data/prices.json`
Updated weekly via workflow.

Uses:

* 90-day median sell price
* Matches reward names exactly

---

### 3️⃣ Vault Status

Source: **Official Warframe Wiki – Void Relic page**

Only relics listed in the table:

> **“Unvaulted/Available Relics”**

are marked as:

```
true = Available (Green)
false = Vaulted (Red)
```

File:
`data/vaultStatus.json`

Generated via:
`scripts/update_vault_status.py`

---

## 🔄 GitHub Actions Workflows

There are separate workflows:

1. **Update Relics + Prices (Weekly)**

   * Runs `update_data.py`
   * Updates:

     * `Relics.min.json`
     * `prices.json`

2. **Update Vault Status (Wiki)**

   * Runs `update_vault_status.py`
   * Updates:

     * `vaultStatus.json`

3. **Deploy UI**

   * Deploys site to GitHub Pages

This separation keeps the architecture clean and modular.

---

# 🎯 Purpose of This Project

## Why This Exists

The goal of this project is to:

* Quickly determine which relic combination gives the highest Platinum value
* Instantly see which relics are currently obtainable
* Avoid manually checking:

  * Wiki
  * Warframe.market
  * Relic drop tables

It combines all relevant information into **one simple interface**.

---

## 💡 The Core Problem It Solves

Warframe players often:

* Don’t know which relics are vaulted
* Don’t know which rewards are most valuable
* Have to check multiple websites
* Waste time opening low-value relics

This tool solves that by:

✔ Combining relic data
✔ Combining price data
✔ Showing vault status
✔ Sorting by Platinum value
✔ Providing a fast relic picker UI

---

# 🧠 Design Philosophy

* Fully automated data updates
* No manual edits required
* Clear data separation
* Natural relic sorting (A1, A2, A10 properly ordered)
* Fast client-side UI (no backend server required)
* GitHub Pages static deployment

---

# 🚀 Short Summary Version (For Quick Copy/Paste)

This project is a Warframe Void Relic reward value calculator built with GitHub Pages. It allows users to select up to 4 relics and view all possible Prime rewards sorted by live Platinum prices from Warframe.market. It automatically updates relic data (from WFCD), price data (from Warframe.market), and vault status (from the Warframe Wiki’s “Unvaulted/Available Relics” table). Vaulted relics are shown in red, available relics in green. The system uses separate GitHub Actions workflows for relic/price updates and vault status updates to maintain a clean modular architecture.
