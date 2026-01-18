package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// OldConfig represents the old schema with business_key
type OldConfig struct {
	ID          uint   `gorm:"primaryKey"`
	BusinessKey string `gorm:"column:business_key"`
	ResourceKey string `gorm:"column:resource_key"`
	Alias       string `gorm:"column:alias"`
	Name        string `gorm:"column:name"`
	Content     string `gorm:"column:content"`
	Type        string `gorm:"column:type"`
	Remark      string `gorm:"column:remark"`
	IsPerm      bool   `gorm:"column:is_perm"`
}

func (OldConfig) TableName() string {
	return "resource_config"
}

// NewConfig represents the new schema with environment_key + pipeline_key
type NewConfig struct {
	ID             uint   `gorm:"primaryKey"`
	EnvironmentKey string `gorm:"column:environment_key"`
	PipelineKey    string `gorm:"column:pipeline_key"`
	ResourceKey    string `gorm:"column:resource_key"`
	Alias          string `gorm:"column:alias"`
	Name           string `gorm:"column:name"`
	Content        string `gorm:"column:content"`
	Type           string `gorm:"column:type"`
	Remark         string `gorm:"column:remark"`
	IsPerm         bool   `gorm:"column:is_perm"`
}

func (NewConfig) TableName() string {
	return "resource_config"
}

// OldAsset represents the old schema with business_key
type OldAsset struct {
	ID          uint   `gorm:"primaryKey"`
	FileID      string `gorm:"column:file_id"`
	BusinessKey string `gorm:"column:business_key"`
	FileName    string `gorm:"column:file_name"`
	ContentType string `gorm:"column:content_type"`
	FileSize    int64  `gorm:"column:file_size"`
	Path        string `gorm:"column:path"`
	URL         string `gorm:"column:url"`
	Remark      string `gorm:"column:remark"`
}

func (OldAsset) TableName() string {
	return "asset"
}

// NewAsset represents the new schema with environment_key + pipeline_key
type NewAsset struct {
	ID             uint   `gorm:"primaryKey"`
	FileID         string `gorm:"column:file_id"`
	EnvironmentKey string `gorm:"column:environment_key"`
	PipelineKey    string `gorm:"column:pipeline_key"`
	FileName       string `gorm:"column:file_name"`
	ContentType    string `gorm:"column:content_type"`
	FileSize       int64  `gorm:"column:file_size"`
	Path           string `gorm:"column:path"`
	URL            string `gorm:"column:url"`
	Remark         string `gorm:"column:remark"`
}

func (NewAsset) TableName() string {
	return "asset"
}

// MigrationRule defines how to map business_key to environment_key + pipeline_key
type MigrationRule struct {
	BusinessKey    string
	EnvironmentKey string
	PipelineKey    string
}

var (
	dbPath      = flag.String("db", "./data/resource.db", "Path to SQLite database")
	dryRun      = flag.Bool("dry-run", false, "Dry run mode (no actual changes)")
	defaultEnv  = flag.String("default-env", "default", "Default environment key")
	defaultPipe = flag.String("default-pipeline", "default", "Default pipeline key")
	rulesFile   = flag.String("rules", "", "Path to migration rules file (format: business_key=environment_key:pipeline_key)")
)

func main() {
	flag.Parse()

	// Load migration rules
	rules := loadMigrationRules()

	// Open database
	db, err := gorm.Open(sqlite.Open(*dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("Failed to get SQL DB: %v", err)
	}
	defer sqlDB.Close()

	log.Printf("Starting migration (dry-run: %v)", *dryRun)

	// Step 1: Check if old columns exist
	if !hasColumn(db, "resource_config", "business_key") {
		log.Println("Column 'business_key' not found in resource_config table")
		log.Println("It appears the migration has already been completed or the old schema doesn't exist")
		return
	}

	// Step 2: Migrate configs
	if err := migrateConfigs(db, rules); err != nil {
		log.Fatalf("Failed to migrate configs: %v", err)
	}

	// Step 3: Migrate assets
	if err := migrateAssets(db, rules); err != nil {
		log.Fatalf("Failed to migrate assets: %v", err)
	}

	if *dryRun {
		log.Println("✓ Dry run completed successfully. No changes were made.")
		log.Println("Run without --dry-run flag to apply the migration.")
	} else {
		log.Println("✓ Migration completed successfully!")
	}
}

func loadMigrationRules() map[string]MigrationRule {
	rules := make(map[string]MigrationRule)

	// Add default rule for unmapped business keys
	rules["*"] = MigrationRule{
		BusinessKey:    "*",
		EnvironmentKey: *defaultEnv,
		PipelineKey:    *defaultPipe,
	}

	// Load custom rules from file if provided
	if *rulesFile != "" {
		data, err := os.ReadFile(*rulesFile)
		if err != nil {
			log.Printf("Warning: Failed to read rules file: %v", err)
			return rules
		}

		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}

			// Format: business_key=environment_key:pipeline_key
			parts := strings.Split(line, "=")
			if len(parts) != 2 {
				log.Printf("Warning: Invalid rule format: %s", line)
				continue
			}

			businessKey := strings.TrimSpace(parts[0])
			envPipeline := strings.Split(strings.TrimSpace(parts[1]), ":")
			if len(envPipeline) != 2 {
				log.Printf("Warning: Invalid env:pipeline format: %s", parts[1])
				continue
			}

			rules[businessKey] = MigrationRule{
				BusinessKey:    businessKey,
				EnvironmentKey: strings.TrimSpace(envPipeline[0]),
				PipelineKey:    strings.TrimSpace(envPipeline[1]),
			}
		}
	}

	return rules
}

func hasColumn(db *gorm.DB, tableName, columnName string) bool {
	var count int64
	db.Raw("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?", tableName, columnName).Scan(&count)
	return count > 0
}

func migrateConfigs(db *gorm.DB, rules map[string]MigrationRule) error {
	log.Println("Migrating resource_config table...")

	// Read all old configs
	var oldConfigs []OldConfig
	if err := db.Find(&oldConfigs).Error; err != nil {
		return fmt.Errorf("failed to read old configs: %w", err)
	}

	log.Printf("Found %d configs to migrate", len(oldConfigs))

	// Group by business_key to show summary
	businessKeys := make(map[string]int)
	for _, cfg := range oldConfigs {
		businessKeys[cfg.BusinessKey]++
	}

	log.Println("Business keys distribution:")
	for bk, count := range businessKeys {
		rule := getRuleForBusinessKey(rules, bk)
		log.Printf("  - %s: %d configs → %s/%s", bk, count, rule.EnvironmentKey, rule.PipelineKey)
	}

	if *dryRun {
		log.Println("Dry run: Skipping actual migration")
		return nil
	}

	// Create backup
	if err := createBackup(db, "resource_config"); err != nil {
		return fmt.Errorf("failed to create backup: %w", err)
	}

	// Migrate each config
	for i, old := range oldConfigs {
		rule := getRuleForBusinessKey(rules, old.BusinessKey)

		result := db.Model(&NewConfig{}).
			Where("id = ?", old.ID).
			Updates(map[string]interface{}{
				"environment_key": rule.EnvironmentKey,
				"pipeline_key":    rule.PipelineKey,
			})

		if result.Error != nil {
			return fmt.Errorf("failed to update config ID=%d: %w", old.ID, result.Error)
		}

		if (i+1)%100 == 0 {
			log.Printf("  Migrated %d/%d configs...", i+1, len(oldConfigs))
		}
	}

	log.Printf("✓ Successfully migrated %d configs", len(oldConfigs))
	return nil
}

func migrateAssets(db *gorm.DB, rules map[string]MigrationRule) error {
	if !hasColumn(db, "asset", "business_key") {
		log.Println("Column 'business_key' not found in asset table, skipping")
		return nil
	}

	log.Println("Migrating asset table...")

	// Read all old assets
	var oldAssets []OldAsset
	if err := db.Find(&oldAssets).Error; err != nil {
		return fmt.Errorf("failed to read old assets: %w", err)
	}

	log.Printf("Found %d assets to migrate", len(oldAssets))

	// Group by business_key to show summary
	businessKeys := make(map[string]int)
	for _, asset := range oldAssets {
		businessKeys[asset.BusinessKey]++
	}

	log.Println("Business keys distribution:")
	for bk, count := range businessKeys {
		rule := getRuleForBusinessKey(rules, bk)
		log.Printf("  - %s: %d assets → %s/%s", bk, count, rule.EnvironmentKey, rule.PipelineKey)
	}

	if *dryRun {
		log.Println("Dry run: Skipping actual migration")
		return nil
	}

	// Create backup
	if err := createBackup(db, "asset"); err != nil {
		return fmt.Errorf("failed to create backup: %w", err)
	}

	// Migrate each asset
	for i, old := range oldAssets {
		rule := getRuleForBusinessKey(rules, old.BusinessKey)

		result := db.Model(&NewAsset{}).
			Where("id = ?", old.ID).
			Updates(map[string]interface{}{
				"environment_key": rule.EnvironmentKey,
				"pipeline_key":    rule.PipelineKey,
			})

		if result.Error != nil {
			return fmt.Errorf("failed to update asset ID=%d: %w", old.ID, result.Error)
		}

		if (i+1)%100 == 0 {
			log.Printf("  Migrated %d/%d assets...", i+1, len(oldAssets))
		}
	}

	log.Printf("✓ Successfully migrated %d assets", len(oldAssets))
	return nil
}

func getRuleForBusinessKey(rules map[string]MigrationRule, businessKey string) MigrationRule {
	if rule, ok := rules[businessKey]; ok {
		return rule
	}
	return rules["*"]
}

func createBackup(db *gorm.DB, tableName string) error {
	backupTableName := fmt.Sprintf("%s_backup_before_migration", tableName)

	log.Printf("Creating backup table: %s", backupTableName)

	// Drop backup table if exists
	db.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %s", backupTableName))

	// Create backup
	result := db.Exec(fmt.Sprintf("CREATE TABLE %s AS SELECT * FROM %s", backupTableName, tableName))
	if result.Error != nil {
		return result.Error
	}

	log.Printf("✓ Backup created: %s", backupTableName)
	return nil
}
