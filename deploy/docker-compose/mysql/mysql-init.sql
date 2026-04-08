CREATE DATABASE IF NOT EXISTS rainbow_bridge DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'rainbow_bridge'@'%' IDENTIFIED BY 'rainbow_bridge_pass';
GRANT ALL PRIVILEGES ON rainbow_bridge.* TO 'rainbow_bridge'@'%';
FLUSH PRIVILEGES;
