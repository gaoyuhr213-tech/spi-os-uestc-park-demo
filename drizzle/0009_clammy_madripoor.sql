ALTER TABLE `entities` ADD `dataEnvironment` enum('production','demo','test','load_test') DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE `entities` ADD `testRunId` varchar(64);