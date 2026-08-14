# SPI-OS Migration Rehearsal

This directory contains deterministic, non-customer assets used only by the
manual migration rehearsal workflow.

- `fixture/synthetic.sql` is synthetic test data. It must never contain
  customer or production data.
- Runtime evidence is written to `artifacts/rehearsal/` by the harness and is
  uploaded by GitHub Actions even when a scenario fails.

The workflow is fail-closed: `BLOCKED` and `FAIL` both produce a non-zero exit.
