/* 手动执行迭代28新增7张表的 DDL */
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

const db = drizzle(process.env.DATABASE_URL);

const ddls = [
`CREATE TABLE IF NOT EXISTS \`dataConflicts\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenantId\` varchar(32) NOT NULL DEFAULT 'uestc',
  \`conflictKey\` varchar(128) NOT NULL,
  \`dcEid\` varchar(16) NOT NULL,
  \`dcFieldName\` varchar(64) NOT NULL,
  \`evidenceIdsJson\` text,
  \`currentValue\` text,
  \`candidateValuesJson\` text,
  \`recommendedEvidenceId\` int,
  \`recommendedReason\` text,
  \`resolutionStatus\` enum('open','suggested','resolved','ignored') NOT NULL DEFAULT 'open',
  \`resolutionMethod\` enum('manual','source_priority','newest_verified','weighted_score','rule_based'),
  \`resolvedValue\` text,
  \`resolvedEvidenceId\` int,
  \`resolvedBy\` varchar(64),
  \`resolvedAt\` timestamp NULL,
  \`dcCreatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`dcUpdatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(\`id\`),
  UNIQUE KEY(\`conflictKey\`)
)`,
`CREATE TABLE IF NOT EXISTS \`dataSources\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenantId\` varchar(32) NOT NULL DEFAULT 'uestc',
  \`sourceKey\` varchar(64) NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`category\` enum('government','company_official','commercial_database','recruitment','media','park_internal','field_visit','enterprise_submission','other') NOT NULL,
  \`provider\` varchar(128),
  \`acquisitionChannel\` enum('manual_paste','excel','api','form','system_sync','file_upload','email','other') NOT NULL DEFAULT 'other',
  \`sourceScope\` varchar(255),
  \`homepageUrl\` varchar(512),
  \`ownerDepartment\` varchar(64),
  \`ownerName\` varchar(64),
  \`authorizationType\` enum('public','user_provided','contractual','internal','unknown') NOT NULL DEFAULT 'unknown',
  \`authorizationNote\` text,
  \`refreshMode\` enum('one_time','manual','scheduled','event_driven') NOT NULL DEFAULT 'manual',
  \`refreshFrequency\` varchar(32),
  \`reliabilityLevel\` enum('A','B','C','D','ungraded') NOT NULL DEFAULT 'ungraded',
  \`sensitivityLevel\` varchar(16),
  \`dsStatus\` enum('active','paused','planned','retired') NOT NULL DEFAULT 'active',
  \`lastSuccessfulSyncAt\` timestamp NULL,
  \`lastFailedSyncAt\` timestamp NULL,
  \`lastFailureReason\` text,
  \`createdBy\` varchar(64),
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(\`id\`),
  UNIQUE KEY(\`sourceKey\`)
)`,
`CREATE TABLE IF NOT EXISTS \`decisionEvidenceLinks\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`delDecisionId\` int NOT NULL,
  \`delEvidenceId\` int NOT NULL,
  \`delRole\` enum('trigger','support','counter_evidence') NOT NULL DEFAULT 'support',
  \`delCreatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(\`id\`)
)`,
`CREATE TABLE IF NOT EXISTS \`entityAliases\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenantId\` varchar(32) NOT NULL DEFAULT 'uestc',
  \`eaEid\` varchar(16) NOT NULL,
  \`aliasType\` enum('legal_name','former_name','brand_name','uscc','domain','phone','address','contract_name','other') NOT NULL,
  \`aliasValue\` varchar(255) NOT NULL,
  \`eaNormalizedValue\` varchar(255),
  \`eaSourceId\` int,
  \`eaVerified\` int NOT NULL DEFAULT 0,
  \`eaCreatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(\`id\`)
)`,
`CREATE TABLE IF NOT EXISTS \`evidenceRecords\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenantId\` varchar(32) NOT NULL DEFAULT 'uestc',
  \`evidenceKey\` varchar(128) NOT NULL,
  \`eid\` varchar(16) NOT NULL,
  \`fieldName\` varchar(64) NOT NULL,
  \`normalizedValue\` text,
  \`originalValue\` text,
  \`valueType\` varchar(16),
  \`sourceId\` int NOT NULL,
  \`batchId\` int NOT NULL,
  \`sourceRecordKey\` varchar(128),
  \`evidenceExcerpt\` text,
  \`evidenceLocation\` varchar(128),
  \`originalUrl\` varchar(512),
  \`erOriginalFileName\` varchar(255),
  \`erCollectedAt\` timestamp NULL,
  \`erEffectiveAt\` timestamp NULL,
  \`erExpiresAt\` timestamp NULL,
  \`confidenceScore\` int,
  \`confidenceLabel\` enum('high','medium','low','unknown') NOT NULL DEFAULT 'unknown',
  \`verificationStatus\` enum('pending','verified','disputed','rejected','expired') NOT NULL DEFAULT 'pending',
  \`erVerifiedBy\` varchar(64),
  \`erVerifiedAt\` timestamp NULL,
  \`erProcessingMethod\` varchar(32),
  \`modelName\` varchar(64),
  \`modelVersion\` varchar(32),
  \`transformationRule\` varchar(128),
  \`reliabilityScore\` int,
  \`isCurrent\` int NOT NULL DEFAULT 0,
  \`supersededByEvidenceId\` int,
  \`erCreatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(\`id\`),
  UNIQUE KEY(\`evidenceKey\`)
)`,
`CREATE TABLE IF NOT EXISTS \`ingestionBatches\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenantId\` varchar(32) NOT NULL DEFAULT 'uestc',
  \`batchKey\` varchar(64) NOT NULL,
  \`sourceId\` int NOT NULL,
  \`ibAcqChannel\` enum('manual_paste','excel','api','form','system_sync','file_upload','email','other') NOT NULL DEFAULT 'excel',
  \`processingMethod\` enum('ai_extract','rule_parse','direct_mapping','manual_entry','connector_sync') NOT NULL DEFAULT 'direct_mapping',
  \`originalFileName\` varchar(255),
  \`originalFileUrl\` varchar(512),
  \`originalPageUrl\` varchar(512),
  \`collectedAt\` timestamp NULL,
  \`effectiveAt\` timestamp NULL,
  \`expiresAt\` timestamp NULL,
  \`ibStatus\` enum('draft','parsing','review','committed','failed','rolled_back') NOT NULL DEFAULT 'draft',
  \`totalRecords\` int NOT NULL DEFAULT 0,
  \`matchedRecords\` int NOT NULL DEFAULT 0,
  \`createdRecords\` int NOT NULL DEFAULT 0,
  \`updatedRecords\` int NOT NULL DEFAULT 0,
  \`conflictRecords\` int NOT NULL DEFAULT 0,
  \`failedRecords\` int NOT NULL DEFAULT 0,
  \`ibActor\` varchar(64) NOT NULL,
  \`ibNotes\` text,
  \`beforeSnapshotJson\` text,
  \`afterSnapshotJson\` text,
  \`ibCreatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`completedAt\` timestamp NULL,
  \`rolledBackAt\` timestamp NULL,
  \`rolledBackBy\` varchar(64),
  PRIMARY KEY(\`id\`),
  UNIQUE KEY(\`batchKey\`)
)`,
`CREATE TABLE IF NOT EXISTS \`sourceFieldPolicies\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenantId\` varchar(32) NOT NULL DEFAULT 'uestc',
  \`sfpFieldName\` varchar(64) NOT NULL,
  \`sourceCategory\` varchar(32) NOT NULL,
  \`sfpPriority\` int NOT NULL DEFAULT 50,
  \`maxAgeDays\` int NOT NULL DEFAULT 180,
  \`requiresVerification\` int NOT NULL DEFAULT 0,
  \`allowAutoApply\` int NOT NULL DEFAULT 0,
  \`sfpNotes\` text,
  \`sfpUpdatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(\`id\`)
)`
];

async function main() {
  for (const ddl of ddls) {
    const name = ddl.match(/`(\w+)`/)?.[1];
    try {
      await db.execute(sql.raw(ddl));
      console.log(`  ✅ ${name} created`);
    } catch (e) {
      console.log(`  ⚠️ ${name}: ${e.message?.slice(0, 80)}`);
    }
  }
  process.exit(0);
}
main();
