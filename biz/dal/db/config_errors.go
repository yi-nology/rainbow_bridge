package db

import (
	"errors"
	"regexp"
	"strings"

	sqlite "github.com/glebarez/go-sqlite"
	mysql "github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/yi-nology/rainbow_bridge/pkg/database"
)

var ErrConfigAliasExists = errors.New("该环境和渠道下已存在相同别名的配置")
var mysqlAliasKey = regexp.MustCompile("for key ['`](?:[^'`]+\\.)?uk_config_active_alias['`]")

// configWriteError 把别名唯一冲突映射为 ErrConfigAliasExists(HTTP 400),
// 其余错误原样返回。SQLite 分支按当前索引列 (scope_id, alias) 匹配——
// a7bc7e5 把索引列从 (environment_key, pipeline_key, alias) 换成
// (scope_id, alias) 时漏改了这里,导致默认库上冲突退化成 500 + 裸 SQL
// 错误回显(issue #36)。同时接受索引名,兼容不同驱动的报错措辞。
func configWriteError(err error) error {
	if err == nil {
		return nil
	}
	var sq *sqlite.Error
	if errors.As(err, &sq) && sq.Code() == 2067 && sqliteAliasViolation(sq.Error()) {
		return ErrConfigAliasExists
	}
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" && pg.ConstraintName == "uk_config_active_alias" {
		return ErrConfigAliasExists
	}
	var my *mysql.MySQLError
	if errors.As(err, &my) && my.Number == 1062 && mysqlAliasKey.MatchString(my.Message) {
		return ErrConfigAliasExists
	}
	return err
}

// sqliteAliasViolation 匹配 uk_config_active_alias 的唯一冲突报错:
// glebarez 驱动报告违规列("UNIQUE constraint failed: resource_config.scope_id,
// resource_config.alias"),部分驱动/版本则报告索引名。
func sqliteAliasViolation(message string) bool {
	return strings.Contains(message, "resource_config.scope_id, resource_config.alias") ||
		strings.Contains(message, database.ConfigAliasIndex)
}
