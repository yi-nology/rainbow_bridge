CREATE DATABASE IF NOT EXISTS rainbow_bridge;

-- 创建用户（如果不存在）
DO
$$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'rainbow_bridge') THEN
        CREATE USER rainbow_bridge WITH PASSWORD 'rainbow_bridge_pass';
    END IF;
END
$$;

-- 授予权限
GRANT ALL PRIVILEGES ON DATABASE rainbow_bridge TO rainbow_bridge;
