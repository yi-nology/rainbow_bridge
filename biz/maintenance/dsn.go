package maintenance

import (
	"errors"
	"github.com/jackc/pgx/v5"
	"net/url"
	"strings"
)

// DatabaseDSN rewrites the actual connection string. pgx.Config.ConnString()
// retains its original input and does not serialize a changed Database field.
// Returning that string after mutation could silently target the original DB.
func DatabaseDSN(dsn, database string) (string, error) {
	if !namePattern.MatchString(database) {
		return "", errors.New("数据库名称不符合维护资源命名限制")
	}
	if _, err := pgx.ParseConfig(dsn); err != nil {
		return "", errors.New("数据库连接配置无效")
	}
	result := ""
	if u, err := url.Parse(dsn); err == nil && (u.Scheme == "postgres" || u.Scheme == "postgresql") {
		u.Path = "/" + database
		u.RawPath = ""
		q := u.Query()
		q.Del("dbname")
		q.Del("database")
		u.RawQuery = q.Encode()
		result = u.String()
	} else {
		result = strings.TrimSpace(dsn) + " dbname='" + database + "'"
	}
	parsed, err := pgx.ParseConfig(result)
	if err != nil || parsed.Database != database {
		return "", errors.New("目标数据库连接重写校验失败")
	}
	return result, nil
}
