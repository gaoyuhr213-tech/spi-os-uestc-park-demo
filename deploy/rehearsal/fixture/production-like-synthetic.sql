-- Deterministic, non-customer migration rehearsal fixture.
-- It must run only in a disposable spios_rehearsal_* database.
SET @fixture_run_id = 'migration-rehearsal-prodlike-v2';
SET @tenant_a = 'rehearsal-park-a';
SET @tenant_b = 'rehearsal-park-b';
SET @fixture_actor = 'ci-rehearsal:migration-rehearsal-prodlike-v2';

-- Idempotent cleanup for this exact synthetic tenant pair only. No production tenant is referenced.
DELETE del FROM decisionEvidenceLinks del JOIN decisions d ON d.id = del.decisionId WHERE d.tenantId IN (@tenant_a, @tenant_b);
DELETE FROM workflowTasks WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM workflowInstances WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM decisions WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM taskCompletions WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM lifecycleEvents WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM parseHistory WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM consents WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM accessPolicies WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM mergeDecisions WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM graphEdges WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM graphNodes WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM entityAliases WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM dataConflicts WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM evidenceRecords WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM industryRuleTodos WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM sourceFieldPolicies WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM scoreModels WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM workflowDefs WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM resources WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM ingestionJobs WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM ingestionBatches WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM connectors WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM dataSources WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM ruleConfigs WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM opsLedger WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM enrichments WHERE tenantId IN (@tenant_a, @tenant_b);
DELETE FROM entities WHERE tenantId IN (@tenant_a, @tenant_b) AND dataEnvironment = 'test' AND testRunId = @fixture_run_id;

-- 69 synthetic enterprises: 35 in tenant A and 34 in tenant B. The first record per tenant
-- intentionally shares a non-unique business name to exercise tenant collision semantics.
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 35
)
INSERT INTO entities
  (tenantId, eid, name, floor, room, ind, nature, cross, tierRole, hiringBase, note, referralPath, entryPoint, signalsJson, dimsJson, demo, dataEnvironment, testRunId)
SELECT tenantId, eid, name, floor, room, ind, nature, cross, tierRole, hiringBase, note, referralPath, entryPoint, signalsJson, dimsJson, demo, dataEnvironment, testRunId
FROM (
  SELECT
    @tenant_a AS tenantId,
    CONCAT('RHA', LPAD(n, 3, '0')) AS eid,
    CASE WHEN n = 1 THEN 'Synthetic Shared Enterprise' ELSE CONCAT('Synthetic Park A Enterprise ', LPAD(n, 2, '0')) END AS name,
    CONCAT(1 + MOD(n - 1, 13), 'F') AS floor,
    CONCAT('A-', LPAD(n, 3, '0')) AS room,
    ELT(1 + MOD(n - 1, 4), 'software', 'ai', 'semiconductor', 'telecom') AS ind,
    'synthetic' AS nature,
    MOD(n, 2) AS cross,
    'tenant' AS tierRole,
    ELT(1 + MOD(n - 1, 4), '楂?, '涓?, '浣?, '鏃?) AS hiringBase,
    'Non-customer production-like migration fixture' AS note,
    ELT(1 + MOD(n - 1, 4), 'A', 'B', 'C', 'D') AS referralPath,
    'fixture' AS entryPoint,
    JSON_OBJECT('fixture', @fixture_run_id, 'tenant', @tenant_a, 'sequence', n) AS signalsJson,
    JSON_OBJECT('demand', 40 + MOD(n, 50), 'pipeMatch', 25 + MOD(n * 7, 75)) AS dimsJson,
    1 AS demo,
    'test' AS dataEnvironment,
    @fixture_run_id AS testRunId
  FROM seq
  UNION ALL
  SELECT
    @tenant_b AS tenantId,
    CONCAT('RHB', LPAD(n, 3, '0')) AS eid,
    CASE WHEN n = 1 THEN 'Synthetic Shared Enterprise' ELSE CONCAT('Synthetic Park B Enterprise ', LPAD(n, 2, '0')) END AS name,
    CONCAT(1 + MOD(n + 3, 13), 'F') AS floor,
    CONCAT('B-', LPAD(n, 3, '0')) AS room,
    ELT(1 + MOD(n, 4), 'software', 'ai', 'semiconductor', 'telecom') AS ind,
    'synthetic' AS nature,
    MOD(n + 1, 2) AS cross,
    'tenant' AS tierRole,
    ELT(1 + MOD(n, 4), '楂?, '涓?, '浣?, '鏃?) AS hiringBase,
    'Non-customer production-like migration fixture' AS note,
    ELT(1 + MOD(n, 4), 'A', 'B', 'C', 'D') AS referralPath,
    'fixture' AS entryPoint,
    JSON_OBJECT('fixture', @fixture_run_id, 'tenant', @tenant_b, 'sequence', n) AS signalsJson,
    JSON_OBJECT('demand', 45 + MOD(n, 45), 'pipeMatch', 25 + MOD(n * 9, 75)) AS dimsJson,
    1 AS demo,
    'test' AS dataEnvironment,
    @fixture_run_id AS testRunId
  FROM seq WHERE n <= 34
) synthetic_entities
ON DUPLICATE KEY UPDATE
  tenantId = VALUES(tenantId), name = VALUES(name), floor = VALUES(floor), room = VALUES(room), ind = VALUES(ind),
  nature = VALUES(nature), cross = VALUES(cross), tierRole = VALUES(tierRole), hiringBase = VALUES(hiringBase),
  note = VALUES(note), referralPath = VALUES(referralPath), entryPoint = VALUES(entryPoint), signalsJson = VALUES(signalsJson),
  dimsJson = VALUES(dimsJson), demo = VALUES(demo), dataEnvironment = 'test', testRunId = @fixture_run_id;

INSERT INTO enrichments
  (tenantId, eid, uscc, regCapital, founded, insured, jobs, topJobs, patents, softCopyrights, hiTech, funding, referralVia, referralNote, verified, verifiedBy, remark)
SELECT tenantId, eid, CONCAT('SYNUSCC-', eid), '1000涓?, '2021', 10 + MOD(CAST(RIGHT(eid, 2) AS UNSIGNED), 90), 1 + MOD(CAST(RIGHT(eid, 2) AS UNSIGNED), 15),
       'Synthetic Platform Engineer', MOD(CAST(RIGHT(eid, 2) AS UNSIGNED), 8), MOD(CAST(RIGHT(eid, 2) AS UNSIGNED), 5),
       '鏄?, 'Synthetic Seed', 'Synthetic Ecosystem', 'Non-customer fixture', '宸叉牳楠?, @fixture_actor, @fixture_run_id
FROM entities WHERE tenantId IN (@tenant_a, @tenant_b) AND testRunId = @fixture_run_id;

INSERT INTO lifecycleEvents (tenantId, eid, stage, note, actor)
SELECT tenantId, eid, ELT(1 + MOD(CAST(RIGHT(eid, 1) AS UNSIGNED), 4), '鏈Е杈?, '宸茶Е杈?, '宸茬害瑙?, '宸叉垚浜?), 'Synthetic lifecycle event', @fixture_actor
FROM entities WHERE tenantId IN (@tenant_a, @tenant_b) AND testRunId = @fixture_run_id;

INSERT INTO ruleConfigs (tenantId, `key`, version, configJson, description)
VALUES
  (@tenant_a, 'rehearsal-park-a:scoring', 1, '{"fixture":"migration-rehearsal-prodlike-v2","weights":{"demand":50,"pipeMatch":50}}', 'Synthetic tenant A rule'),
  (@tenant_b, 'rehearsal-park-b:scoring', 1, '{"fixture":"migration-rehearsal-prodlike-v2","weights":{"demand":50,"pipeMatch":50}}', 'Synthetic tenant B rule');

INSERT INTO resources (tenantId, rtype, name, org, needTags, indTags, stageTags, capacity, graphKey, note, active)
VALUES
  (@tenant_a, 'mentor', 'Synthetic Mentor A', 'Synthetic Network', 'talent,policy', 'software,ai', 'growth', 5, 'rha:mentor', 'Fixture resource', 1),
  (@tenant_a, 'investor', 'Synthetic Investor A', 'Synthetic Capital', 'funding', 'semiconductor', 'growth', 3, 'rha:investor', 'Fixture resource', 1),
  (@tenant_b, 'mentor', 'Synthetic Mentor B', 'Synthetic Network', 'talent,policy', 'software,telecom', 'growth', 5, 'rhb:mentor', 'Fixture resource', 1),
  (@tenant_b, 'vendor', 'Synthetic Vendor B', 'Synthetic Services', 'digital', 'ai', 'startup', 4, 'rhb:vendor', 'Fixture resource', 1);

INSERT INTO connectors (tenantId, cid, name, ctype, status, source, configJson)
VALUES
  (@tenant_a, 'rehearsal-a-manual', 'Synthetic Manual Connector A', 'manual', 'active', 'non-customer fixture', '{"fixture":true}'),
  (@tenant_b, 'rehearsal-b-manual', 'Synthetic Manual Connector B', 'manual', 'active', 'non-customer fixture', '{"fixture":true}');

INSERT INTO ingestionJobs (tenantId, connectorId, status, rowsIn, rowsOut, rowsSkipped, summaryJson, triggeredBy, finishedAt)
VALUES
  (@tenant_a, 'rehearsal-a-manual', 'success', 35, 35, 0, '{"fixture":"migration-rehearsal-prodlike-v2"}', @fixture_actor, NOW()),
  (@tenant_b, 'rehearsal-b-manual', 'success', 34, 34, 0, '{"fixture":"migration-rehearsal-prodlike-v2"}', @fixture_actor, NOW());

INSERT INTO dataSources
  (tenantId, sourceKey, name, category, provider, acquisitionChannel, sourceScope, authorizationType, authorizationNote, refreshMode, reliabilityLevel, sensitivityLevel, dsStatus, createdBy)
VALUES
  (@tenant_a, 'rehearsal-a-source', 'Synthetic Source A', 'other', 'SPI-OS CI', 'manual_paste', 'synthetic only', 'internal', 'No customer data', 'one_time', 'A', 'internal', 'active', @fixture_actor),
  (@tenant_b, 'rehearsal-b-source', 'Synthetic Source B', 'other', 'SPI-OS CI', 'manual_paste', 'synthetic only', 'internal', 'No customer data', 'one_time', 'A', 'internal', 'active', @fixture_actor);

INSERT INTO ingestionBatches
  (tenantId, batchKey, sourceId, acquisitionChannel, processingMethod, originalFileName, status, totalRecords, matchedRecords, createdRecords, updatedRecords, conflictRecords, failedRecords, actor, notes, completedAt)
VALUES
  (@tenant_a, 'rehearsal-a-batch', (SELECT id FROM dataSources WHERE sourceKey = 'rehearsal-a-source'), 'manual_paste', 'direct_mapping', 'synthetic-a.json', 'committed', 35, 35, 35, 0, 1, 0, @fixture_actor, 'Non-customer fixture', NOW()),
  (@tenant_b, 'rehearsal-b-batch', (SELECT id FROM dataSources WHERE sourceKey = 'rehearsal-b-source'), 'manual_paste', 'direct_mapping', 'synthetic-b.json', 'committed', 34, 34, 34, 0, 1, 0, @fixture_actor, 'Non-customer fixture', NOW());

INSERT INTO evidenceRecords
  (tenantId, evidenceKey, eid, fieldName, normalizedValue, originalValue, valueType, sourceId, batchId, sourceRecordKey, evidenceExcerpt, confidenceScore, confidenceLabel, verificationStatus, verifiedBy, verifiedAt, processingMethod, transformationRule, reliabilityScore, isCurrent)
SELECT e.tenantId, CONCAT('evidence-', e.eid), e.eid, 'industry', e.ind, e.ind, 'string',
       (SELECT id FROM dataSources ds WHERE ds.tenantId = e.tenantId),
       (SELECT id FROM ingestionBatches ib WHERE ib.tenantId = e.tenantId),
       e.eid, 'Synthetic industry evidence', 90, 'high', 'verified', @fixture_actor, NOW(), 'direct_mapping', 'fixture-v2', 95, 1
FROM entities e WHERE e.tenantId IN (@tenant_a, @tenant_b) AND e.testRunId = @fixture_run_id;

INSERT INTO dataConflicts
  (tenantId, conflictKey, eid, fieldName, evidenceIdsJson, currentValue, candidateValuesJson, recommendedReason, resolutionStatus)
VALUES
  (@tenant_a, 'rehearsal-a-conflict', 'RHA001', 'floor', '[]', '1F', '["2F"]', 'Synthetic conflict for rehearsal coverage', 'open'),
  (@tenant_b, 'rehearsal-b-conflict', 'RHB001', 'floor', '4F', '["5F"]', 'Synthetic conflict for rehearsal coverage', 'open');

INSERT INTO entityAliases (tenantId, eid, aliasType, aliasValue, normalizedValue, verified)
SELECT tenantId, eid, 'legal_name', name, LOWER(REPLACE(name, ' ', '')), 1
FROM entities WHERE tenantId IN (@tenant_a, @tenant_b) AND testRunId = @fixture_run_id;

INSERT INTO sourceFieldPolicie…41031 tokens truncated…denceLinks", "industryRuleTodos", "scoreModels", "ruleConfigs")
$temporaryPath = Join-Path ([System.IO.Path]::GetTempPath()) ("spios-business-fingerprint-" + [guid]::NewGuid().ToString("N") + ".sql")
$previousPassword = $env:MYSQL_PWD
$env:MYSQL_PWD = $connection.Password
try {
    & mysqldump --protocol=TCP "--host=$($connection.Host)" "--port=$($connection.Port)" "--user=$($connection.User)" --no-create-info --skip-triggers --no-tablespaces --skip-comments --skip-dump-date --skip-set-charset --compact $connection.Database @tables | Set-Content -LiteralPath $temporaryPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "FAIL: business fingerprint dump failed" }
    Write-Output (Get-Sha256 $temporaryPath)
} finally {
    $env:MYSQL_PWD = $previousPassword
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
}
