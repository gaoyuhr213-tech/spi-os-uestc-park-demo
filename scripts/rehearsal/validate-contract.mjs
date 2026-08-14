import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const read = path => readFileSync(path, "utf8");
const fileSha256 = path => sha256(read(path).replace(/\r\n/g, "\n"));

export function validateRehearsalContract() {
  const errors = [];
  const contractPath = join(root, "deploy", "rehearsal", "canonical-baseline.contract.json");
  const fixturePath = join(root, "deploy", "rehearsal", "fixture", "production-like-synthetic.sql");
  const runnerPath = join(root, "scripts", "rehearsal", "run.ps1");
  const smokePath = join(root, "scripts", "rehearsal", "app-smoke.ps1");
  const workflowPath = join(root, ".github", "workflows", "migration-rehearsal.yml");

  for (const path of [contractPath, fixturePath, runnerPath, smokePath, workflowPath]) {
    if (!existsSync(path)) errors.push(`missing required rehearsal asset: ${path.replace(`${root}/`, "")}`);
  }
  if (errors.length) return { ok: false, errors };

  const contract = JSON.parse(read(contractPath));
  if (contract.schema !== "spios.rehearsal-canonical-baseline.v1") errors.push("unexpected canonical baseline schema");
  if (contract.status !== "CANDIDATE_PENDING_ARCHITECT_REVIEW") errors.push("baseline contract must remain a candidate");
  if (contract.safety?.mirrorIsNotSourceAuthority !== true) errors.push("mirror authority boundary missing");
  if (contract.safety?.containsCustomerData !== false || contract.safety?.productionSecretsAllowed !== false) errors.push("fixture safety declaration invalid");

  const migrations = Array.isArray(contract.migrationJournal) ? contract.migrationJournal : [];
  if (migrations.length !== 11) errors.push(`expected 11 canonical migrations, received ${migrations.length}`);
  if (new Set(migrations.map(item => item.path)).size !== migrations.length) errors.push("duplicate migration paths in contract");
  for (const migration of migrations) {
    const path = join(root, "drizzle", migration.path);
    if (!existsSync(path)) {
      errors.push(`missing migration: ${migration.path}`);
    } else if (fileSha256(path) !== migration.sha256) {
      errors.push(`migration checksum drift: ${migration.path}`);
    }
  }
  const schemaPath = join(root, "drizzle", "schema.ts");
  if (!existsSync(schemaPath) || fileSha256(schemaPath) !== contract.schemaSha256) errors.push("schema checksum drift");

  const fixture = read(fixturePath);
  const expectedFixtureTokens = [
    "migration-rehearsal-prodlike-v2", "rehearsal-park-a", "rehearsal-park-b", "Synthetic Shared Enterprise",
    "INSERT INTO enrichments", "INSERT INTO evidenceRecords", "INSERT INTO decisions", "INSERT INTO workflowInstances",
    "INSERT INTO resources", "INSERT INTO industryRuleTodos", "INSERT INTO graphEdges", "INSERT INTO connectors",
    "INSERT INTO dataSources", "INSERT INTO ingestionBatches", "INSERT INTO scoreModels", "INSERT INTO accessPolicies",
    "INSERT INTO consents", "INSERT INTO opsLedger"
  ];
  for (const token of expectedFixtureTokens) if (!fixture.includes(token)) errors.push(`fixture coverage missing: ${token}`);
  if (fixture.includes("production' AS dataEnvironment")) errors.push("fixture attempts to write production dataEnvironment");

  const runner = read(runnerPath);
  const commonPath = join(root, "scripts", "rehearsal", "common.ps1");
  const lineEndingPath = join(root, "scripts", "rehearsal", "hash-normalization.ps1");
  for (const scenario of ["line-ending-normalization", "canonical-baseline-source", "canonical-baseline-runtime", "application-readiness"]) {
    if (!runner.includes(scenario)) errors.push(`runner missing scenario: ${scenario}`);
  }
  if (!existsSync(commonPath) || !existsSync(lineEndingPath)) {
    errors.push("cross-platform line ending rehearsal assets are missing");
  } else {
    const common = read(commonPath);
    const lineEnding = read(lineEndingPath);
    for (const token of ["ReadAllBytes", "0x0D", "0x0A", "SHA256"]) {
      if (!common.includes(token)) errors.push(`PowerShell canonical hash normalization missing: ${token}`);
    }
    for (const token of ["中文字段", "LF and CRLF canonical hashes differ", "bytePreserving"]) {
      if (!lineEnding.includes(token)) errors.push(`line ending rehearsal assertion missing: ${token}`);
    }
  }
  const smoke = read(smokePath);
  for (const assertion of ["NODE_ENV = \"production\"", "DATABASE_URL = $DatabaseUrl", "observability.health", "decisionEngineReady"]) {
    if (!smoke.includes(assertion)) errors.push(`application smoke missing assertion: ${assertion}`);
  }
  const workflow = read(workflowPath);
  if (!workflow.includes("workflow_dispatch:")) errors.push("workflow must require manual dispatch");
  if (workflow.includes("pull_request:")) errors.push("workflow must not auto-run on pull requests");
  if (!workflow.includes("application readiness")) errors.push("workflow does not describe readiness coverage");

  return {
    ok: errors.length === 0,
    errors,
    migrationCount: migrations.length,
    fixtureId: contract.fixtureContract?.fixtureId,
    canonicalWorkspaceCommit: contract.canonicalWorkspaceCommit,
  };
}

const result = validateRehearsalContract();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
