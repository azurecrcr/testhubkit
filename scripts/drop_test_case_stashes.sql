USE testhub;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = 'testhub'
      AND TABLE_NAME = 'tc_share_snapshots'
      AND CONSTRAINT_NAME IN ('fk_tc_share_stash', 'fk_share_stash')
);
SET @fk_name := (
    SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = 'testhub'
      AND TABLE_NAME = 'tc_share_snapshots'
      AND CONSTRAINT_NAME IN ('fk_tc_share_stash', 'fk_share_stash')
    LIMIT 1
);
SET @sql := IF(@fk_exists > 0,
    CONCAT('ALTER TABLE tc_share_snapshots DROP FOREIGN KEY ', @fk_name),
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'testhub'
      AND TABLE_NAME = 'tc_share_snapshots'
      AND COLUMN_NAME = 'stash_id'
);
SET @sql2 := IF(@col_exists > 0,
    'ALTER TABLE tc_share_snapshots DROP COLUMN stash_id',
    'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

DROP TABLE IF EXISTS test_case_stashes;
