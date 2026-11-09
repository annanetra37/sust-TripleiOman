# Electronics Sector Pack — Licence

## Content

This pack bundles:

- **KPI definitions** (kpis.json) — derived from publicly available SASB, ESRS,
  and RBA framework documents. SASB and GRI content is reproduced under fair
  use for the purpose of reporting-framework interoperability.
- **Materiality starters** (materiality.json) — drafted in-house by the Triple I
  content team, based on publicly available industry benchmarks.
- **Emission factors** (factors.json) — sourced from:
  - Ecoinvent 3.10 (public subset) — single-user licence permitted for
    interoperability; customers with full Ecoinvent subscriptions may
    replace these values via the AI classifier review step.
  - DEFRA 2024 (UK Government Open Government Licence v3.0).

## Attribution

When KPI values are computed from bundled factors, the factor's `source` field
is carried through to `PcfCalculation.factorSnapshot` so auditors can verify
provenance.

## Redistribution

This pack is bundled exclusively with Triple I ESG Portal deployments under a
valid customer subscription. Customers may not redistribute the factor set as
a standalone dataset.
