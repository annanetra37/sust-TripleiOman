# Electronics / Semiconductor Sector — Report Narrative Scaffolds

These templates are consumed by the report generator (backend/src/routes/reportsV2.js)
when the company's active sector pack is `electronics`.

---

## Climate Strategy Narrative

{{company.name}} operates in the {{company.industry}} sector with principal manufacturing
and assembly operations across {{orgUnits.countries}}. The company's material climate-
related risks follow the pattern typical for electronics and semiconductor producers:
(i) use-phase emissions of downstream data-center and end-user products dominate lifecycle
impact, (ii) supply-chain concentration in Southeast Asia exposes operations to grid
decarbonisation timelines in Vietnam and Malaysia, and (iii) growing customer-driven
decarbonisation requirements from large OEM buyers (Apple, Microsoft, HPE, Dell) make
primary-data PCFs a commercial necessity.

In the reporting year {{year}}, {{company.name}} recorded Scope 1+2+3 emissions of
{{totalEmissions}} tCO2e, with a Scope-3 share of {{scope3Share}}%. The intensity metric
most commonly used by sector peers — tonnes of CO2e per EUR million revenue — stood at
{{intensity}} for the period.

## Product Carbon Footprint Coverage

{{company.name}} maintains product carbon footprint calculations for {{pcfCoveragePct}}%
of revenue across its SKU portfolio, aligned with ISO 14067 methodology and the
WBCSD PACT Pathfinder v2 disclosure format. The weighted-average primary-data share
across calculated PCFs is {{primaryDataPct}}% — this aligns with ESRS E1 §51(g).

## RBA Code of Conduct

{{rbaAuditedPct}}% of tier-1 suppliers have been audited against the Responsible Business
Alliance Code of Conduct within the last 24 months. Validated Audit Process (VAP) closure
rate is {{rbaVapPct}}%.

## Conflict Minerals

Conflict-minerals (3TG) smelter coverage: {{smeltersIdentified}} smelters identified,
{{smeltersRmi}}% compliant with the Responsible Minerals Initiative (RMI) smelter list.
