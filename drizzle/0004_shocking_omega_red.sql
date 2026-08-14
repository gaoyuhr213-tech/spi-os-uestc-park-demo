CREATE TABLE `parseHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eid` varchar(16) NOT NULL,
	`sourceType` enum('ai_parse','ai_parse_batch','excel_import') NOT NULL,
	`rawText` text,
	`resultJson` text NOT NULL,
	`fieldsWritten` text NOT NULL,
	`confidence` varchar(8),
	`actor` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parseHistory_id` PRIMARY KEY(`id`)
);
