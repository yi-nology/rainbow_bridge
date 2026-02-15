-- MySQL initialization script for Rainbow Bridge
-- This script will be executed automatically when the container starts for the first time

-- The database and user are already created by environment variables
-- This script is for any additional setup if needed

-- Ensure utf8mb4 is used
ALTER DATABASE rainbow_bridge CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Grant all privileges (already done by MYSQL_USER env, but explicit is better)
GRANT ALL PRIVILEGES ON rainbow_bridge.* TO 'rainbow_bridge'@'%';
FLUSH PRIVILEGES;

-- Tables will be auto-created by GORM migrations
