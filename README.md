# EV Charging Station – Monte Carlo Simulation

A web-based Monte Carlo simulation for analyzing and optimizing the operation of a small EV charging station.

The application evaluates different combinations of:

- Number of charging stalls (N)
- Price per kWh (p)

and determines the configuration that maximizes annual profit under optional service quality constraints.

---

## Overview

This project models the yearly operation of an EV charging station using stochastic simulation.

The model includes:

- Seasonal demand variation (monthly changes)
- Temperature-dependent arrival rates
- Stochastic vehicle arrivals (Poisson process)
- Random energy consumption per charging session
- Limited charging capacity and queue formation
- Customer abandonment due to long waiting times
- Fixed and variable operational costs

For each (N, p) combination, multiple Monte Carlo runs are executed to estimate expected performance metrics.

---

## Optimization Problem

The objective is:

\[
\max\_{N,p} \mathbb{E}[\text{Profit}(N,p)]
\]

Subject to optional constraints:

- Maximum drop rate
- Maximum 95th percentile waiting time

A grid search is performed over user-defined ranges for N and p.

---

## Outputs

The application provides:

- Profit heatmap (N vs. p)
- Drop rate heatmap
- Pareto chart (Profit vs. Drop Rate)
- KPI summary for the optimal configuration
- Export of full grid results (CSV / JSON)
- Auto-generated summary for reporting

---

## Technology Stack

- React
- TypeScript
- Vite
- TailwindCSS
- Apache ECharts
- Web Workers (for non-blocking simulation)

---

## Running the Project

Install dependencies:

```bash
npm install

npm run dev
```
