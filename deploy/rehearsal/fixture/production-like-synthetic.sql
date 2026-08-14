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
    ELT(1 + MOD(n - 1, 4), '高', '中', '低', '无') AS hiringBase,
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
    ELT(1 + MOD(n, 4), '高', '中', '低', '无') AS hiringBase,
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
SELECT tenantId, eid, CONCAT('SYNUSCC-', eid), '1000万', '2021', 10 + MOD(CAST(RIGHT(eid, 2) AS UNSIGNED), 90), 1 + MOD(CAST(RIGHT(eid, 2) AS UNSIGNED), 15),
       'Synthetic Platform Engineer', MOD(CAST(RIGHT(eid, 2) AS UNSIGNED), 8), MOD(CAST(RIGHT(eid, 2) AS UNSIGNED), 5),
       '是', 'Synthetic Seed', 'Synthetic Ecosystem', 'Non-customer fixture', '已核验', @fixture_actor, @fixture_run_id
FROM entities WHERE tenantId IN (@tenant_a, @tenant_b) AND testRunId = @fixture_run_id;

INSERT INTO lifecycleEvents (tenantId, eid, stage, note, actor)
SELECT tenantId, eid, ELT(1 + MOD(CAST(RIGHT(eid, 1) AS UNSIGNED), 4), '未触达', '已触达', '已约见', '已成交'), 'Synthetic lifecycle event', @fixture_actor
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

INSERT INTO sourceFieldPolicies (tenantId, fieldName, sourceCategory, priority, maxAgeDays, requiresVerification, allowAutoApply, notes)
VALUES
  (@tenant_a, 'industry', 'other', 80, 365, 1, 0, 'Synthetic fixture policy'),
  (@tenant_b, 'industry', 'other', 80, 365, 1, 0, 'Synthetic fixture policy');

INSERT INTO industryRuleTodos
  (tenantId, todoKey, rawIndustry, fallbackScore, entityCount, sampleEidsJson, firstBatchId, lastBatchId, status, ruleVersion, resolutionNote)
VALUES
  (@tenant_a, 'rehearsal-a:synthetic-unmapped', 'synthetic-unmapped', 25, 1, '["RHA001"]', (SELECT id FROM ingestionBatches WHERE batchKey='rehearsal-a-batch'), (SELECT id FROM ingestionBatches WHERE batchKey='rehearsal-a-batch'), 'open', 'fixture-v2', 'Synthetic governance todo'),
  (@tenant_b, 'rehearsal-b:synthetic-unmapped', 'synthetic-unmapped', 25, 1, '["RHB001"]', (SELECT id FROM ingestionBatches WHERE batchKey='rehearsal-b-batch'), (SELECT id FROM ingestionBatches WHERE batchKey='rehearsal-b-batch'), 'open', 'fixture-v2', 'Synthetic governance todo');

INSERT INTO scoreModels (tenantId, modelKey, role, weightsJson, backtestJson, lineageJson, explanation)
VALUES
  (@tenant_a, 'rehearsal-a-champion', 'champion', '{"demand":50,"pipeMatch":50}', '{"sample":35}', '{"fixture":"migration-rehearsal-prodlike-v2"}', 'Synthetic model'),
  (@tenant_b, 'rehearsal-b-champion', 'champion', '{"demand":50,"pipeMatch":50}', '{"sample":34}', '{"fixture":"migration-rehearsal-prodlike-v2"}', 'Synthetic model');

INSERT INTO decisions
  (tenantId, eid, dtype, title, reason, stars, needTag, matchedResources, status, assignee, outcome, outcomeNote, dealAmount, revenueTier, basedOn, genKey)
VALUES
  (@tenant_a, 'RHA001', 'contact', 'Synthetic contact decision A', 'Synthetic evidence trigger', 4, 'talent', '["Synthetic Mentor A"]', 'suggested', @fixture_actor, NULL, NULL, NULL, NULL, '{"fixture":"migration-rehearsal-prodlike-v2"}', 'rehearsal-a:RHA001:contact'),
  (@tenant_b, 'RHB001', 'policy', 'Synthetic policy decision B', 'Synthetic evidence trigger', 4, 'policy', '["Synthetic Mentor B"]', 'suggested', @fixture_actor, NULL, NULL, NULL, NULL, '{"fixture":"migration-rehearsal-prodlike-v2"}', 'rehearsal-b:RHB001:policy');

INSERT INTO decisionEvidenceLinks (decisionId, evidenceId, role)
VALUES
  ((SELECT id FROM decisions WHERE genKey = 'rehearsal-a:RHA001:contact'), (SELECT id FROM evidenceRecords WHERE evidenceKey = 'evidence-RHA001'), 'trigger'),
  ((SELECT id FROM decisions WHERE genKey = 'rehearsal-b:RHB001:policy'), (SELECT id FROM evidenceRecords WHERE evidenceKey = 'evidence-RHB001'), 'support');

INSERT INTO workflowDefs (tenantId, defKey, name, decisionType, stepsJson, active, version)
VALUES
  (@tenant_a, 'rehearsal-a-contact-v1', 'Synthetic Contact Workflow A', 'contact', '[{"kind":"human","title":"Synthetic outreach","slaHours":24}]', 1, 1),
  (@tenant_b, 'rehearsal-b-policy-v1', 'Synthetic Policy Workflow B', 'policy', '[{"kind":"human","title":"Synthetic policy review","slaHours":24}]', 1, 1);

INSERT INTO workflowInstances (tenantId, defKey, decisionId, eid, status, currentStep, stepStatesJson, startedBy)
VALUES
  (@tenant_a, 'rehearsal-a-contact-v1', (SELECT id FROM decisions WHERE genKey = 'rehearsal-a:RHA001:contact'), 'RHA001', 'running', 0, '[{"step":0,"status":"open"}]', @fixture_actor),
  (@tenant_b, 'rehearsal-b-policy-v1', (SELECT id FROM decisions WHERE genKey = 'rehearsal-b:RHB001:policy'), 'RHB001', 'running', 0, '[{"step":0,"status":"open"}]', @fixture_actor);

INSERT INTO workflowTasks (tenantId, instanceId, stepIndex, title, assignee, status, slaHours, dueAt)
VALUES
  (@tenant_a, (SELECT id FROM workflowInstances WHERE defKey='rehearsal-a-contact-v1'), 0, 'Synthetic outreach task', @fixture_actor, 'open', 24, DATE_ADD(NOW(), INTERVAL 1 DAY)),
  (@tenant_b, (SELECT id FROM workflowInstances WHERE defKey='rehearsal-b-policy-v1'), 0, 'Synthetic policy task', @fixture_actor, 'open', 24, DATE_ADD(NOW(), INTERVAL 1 DAY));

INSERT INTO graphNodes (tenantId, nodeKey, kind, label, attrsJson)
VALUES
  (@tenant_a, 'rha:hub', 'platform', 'Synthetic Hub A', '{"fixture":true}'),
  (@tenant_a, 'rha:RHA001', 'company', 'Synthetic Shared Enterprise', '{"fixture":true}'),
  (@tenant_a, 'rha:mentor', 'person', 'Synthetic Mentor A', '{"fixture":true}'),
  (@tenant_b, 'rhb:hub', 'platform', 'Synthetic Hub B', '{"fixture":true}'),
  (@tenant_b, 'rhb:RHB001', 'company', 'Synthetic Shared Enterprise', '{"fixture":true}'),
  (@tenant_b, 'rhb:mentor', 'person', 'Synthetic Mentor B', '{"fixture":true}');

INSERT INTO graphEdges (tenantId, fromKey, toKey, relType, strength, evidence, pathTag)
VALUES
  (@tenant_a, 'rha:hub', 'rha:mentor', 'partner', 80, 'Synthetic evidence', 'A'),
  (@tenant_a, 'rha:mentor', 'rha:RHA001', 'referral', 75, 'Synthetic evidence', 'A'),
  (@tenant_b, 'rhb:hub', 'rhb:mentor', 'partner', 80, 'Synthetic evidence', 'B'),
  (@tenant_b, 'rhb:mentor', 'rhb:RHB001', 'referral', 75, 'Synthetic evidence', 'B');

INSERT INTO consents (tenantId, eid, scope, status, grantedBy, basis)
VALUES
  (@tenant_a, 'RHA001', 'full_profile', 'granted', @fixture_actor, 'Synthetic test consent'),
  (@tenant_b, 'RHB001', 'full_profile', 'granted', @fixture_actor, 'Synthetic test consent');

INSERT INTO accessPolicies (tenantId, role, fieldGroup, effect, condition, updatedBy)
VALUES
  (@tenant_a, 'admin', 'business', 'allow', 'fixture_only', @fixture_actor),
  (@tenant_b, 'admin', 'business', 'allow', 'fixture_only', @fixture_actor);

INSERT INTO mergeDecisions (tenantId, sourceEids, targetEid, confidence, evidenceJson, status, decidedBy, decidedAt)
VALUES
  (@tenant_a, '["RHA001"]', 'RHA001', 100, '{"fixture":true}', 'confirmed', @fixture_actor, NOW()),
  (@tenant_b, '["RHB001"]', 'RHB001', 100, '{"fixture":true}', 'confirmed', @fixture_actor, NOW());

INSERT INTO parseHistory (tenantId, eid, sourceType, rawText, resultJson, fieldsWritten, confidence, actor)
VALUES
  (@tenant_a, 'RHA001', 'excel_import', '{"synthetic":true}', '{"industry":"software"}', 'industry', 'high', @fixture_actor),
  (@tenant_b, 'RHB001', 'excel_import', '{"synthetic":true}', '{"industry":"ai"}', 'industry', 'high', @fixture_actor);

INSERT INTO taskCompletions (tenantId, eid, taskType, weekKey, note, actor)
VALUES
  (@tenant_a, 'RHA001', '首触', '2026-W01', 'Synthetic completion', @fixture_actor),
  (@tenant_b, 'RHB001', '培育跟进', '2026-W01', 'Synthetic completion', @fixture_actor);

INSERT INTO opsLedger (tenantId, action, targetEid, detail, actor, beforeJson, afterJson)
SELECT tenantId, 'seed', eid, 'Synthetic production-like rehearsal fixture', @fixture_actor, NULL,
       JSON_OBJECT('fixture', @fixture_run_id, 'environment', 'test')
FROM entities WHERE tenantId IN (@tenant_a, @tenant_b) AND testRunId = @fixture_run_id;
