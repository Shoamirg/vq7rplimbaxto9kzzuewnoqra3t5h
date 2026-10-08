# Invoice history volume rehearsal

Run from the repository root on Linux with Docker, Compose and Python3:

```bash
python3 garageos/scripts/test_invoice_volume.py --output "$HOME/garageos-qa/invoice-volume"
```

The rehearsal reuses the owned production environment from the database recovery
gate: current PostgreSQL16 image, current migrations/backend image, Redis,
production configuration, one backend worker and enabled rate limiting. It never
connects to a client database or publishes database/API ports. Only UUID-owned
resources and temporary synthetic credentials are used. Native Linux fixture
copies are mounted read-only; dumps and credentials are removed during cleanup.

The profile adds1000 distinct customers/vehicles and10000 issued UZS invoices in
each of two garages, on top of the two-garage recovery seed. This represents a
declared synthetic history of20002 invoices, not a measured client workload.
Distinct related identities expose query amplification that repeated lookups of
one cached customer/vehicle could hide. PostgreSQL statistics are refreshed after
bulk insertion.

Fresh service sessions measure statement counts for5/30/100-row invoice pages.
The100-row page must use at most20 SQL statements and at most5 more statements
than the5-row page. This is a query-work gate, independent of machine speed.
The authenticated HTTP regression separately allows up to25 total statements,
including identity/permission checks, and checks inactive/missing/foreign linked
records, label/financial projections, deterministic ordering and full detail.

Actual production HTTP reads exercise first/deep/max pages, old invoice codes,
customer/plate search, literal-wildcard empty results and foreign-tenant denial.
Eight warm-up requests validate correctness. Two measured batches each contain40
requests: sequential and five-client concurrency. Every response must preserve
tenant totals/counts/KPIs, bounded page/response sizes and customer history scope.
Any HTTP error or incorrect response fails the gate; rate limiting stays enabled.

Sanitized receipts include source/image/PostgreSQL/fixture identities, dataset
counts, Docker engine resources/kernel/architecture, query counts and timings,
sample counts, response sizes, errors, throughput and nearest-rank p50/p95/max.
Per-scenario percentiles have only five samples and must be read with that limit.
The whole mixed batch has40 samples. Warm-up, population, migration and login
costs are excluded from the reported read timings. Credentials/tokens and raw
customer/document payloads are not archived.

CI runs this profile and archives its evidence. Timings are a baseline for the
recorded local environment; the gate deliberately does not promise the same
latency/throughput on other hardware, Internet/TLS links or physical devices.
Client acceptance still needs an agreed representative workload, the actual
deployment, real Android/iPhone UI/network measurements and the garage pilot.
Compare before/after measurements under the same declared profile and inspect
correctness/query-work alongside timing; a fast incorrect response is a failure.
