-- PostgreSQL initialization script for Rainbow Bridge
-- This script will be executed automatically when the container starts for the first time

-- The database and user are already created by environment variables
-- This script is for any additional setup if needed

-- Set default timezone
SET timezone = 'Asia/Shanghai';

-- Enable extensions if needed (uncomment if required)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant all privileges (already done by POSTGRES_USER env, but explicit is better)
GRANT ALL PRIVILEGES ON DATABASE rainbow_bridge TO rainbow_bridge;

-- Tables will be auto-created by GORM migrations
