INSERT INTO `entities`
  (`tenantId`, `eid`, `name`, `floor`, `room`, `ind`, `nature`, `cross`,
   `tierRole`, `demo`, `dataEnvironment`, `testRunId`)
VALUES
  ('rehearsal', 'R0001', 'Synthetic Alpha', '1F', 'R101', 'software',
   'synthetic', 0, 'tenant', 1, 'test', 'migration-rehearsal-v1'),
  ('rehearsal', 'R0002', 'Synthetic Beta', '2F', 'R202', 'services',
   'synthetic', 0, 'support', 1, 'test', 'migration-rehearsal-v1')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `dataEnvironment` = 'test',
  `testRunId` = 'migration-rehearsal-v1';

INSERT INTO `opsLedger`
  (`tenantId`, `action`, `targetEid`, `detail`, `actor`)
SELECT 'rehearsal', 'seed', 'R0001', 'synthetic migration fixture', 'ci-rehearsal'
WHERE NOT EXISTS (
  SELECT 1 FROM `opsLedger`
  WHERE `tenantId` = 'rehearsal'
    AND `action` = 'seed'
    AND `targetEid` = 'R0001'
    AND `actor` = 'ci-rehearsal'
);
