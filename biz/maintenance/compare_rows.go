package maintenance

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"strconv"
	"strings"
)

// CompareLogical verifies every restored field, not just row counts. The only
// permitted differences are the declared snapshot bucket/legacy locator flag
// and a non-regressing release-number bound captured at the switch window.
func CompareLogical(ctx context.Context, db *pgx.Conn, s *Store, tables []Table, snapshotBucket string) error {
	if _, err := db.Exec(ctx, `SET TIME ZONE 'UTC';SET DateStyle='ISO,YMD';SET bytea_output='hex'`); err != nil {
		return err
	}
	for _, table := range tables {
		expr := make([]string, len(table.Columns))
		for i, col := range table.Columns {
			expr[i] = pgx.Identifier{col}.Sanitize() + "::text"
		}
		rows, err := db.Query(ctx, "SELECT "+strings.Join(expr, ",")+" FROM "+pgx.Identifier{"public", table.Name}.Sanitize()+" ORDER BY id")
		if err != nil {
			return err
		}
		for _, f := range table.Files {
			source, e := s.read(ctx, s.backup, f.Key, "")
			if e != nil {
				rows.Close()
				return e
			}
			scanner := bufio.NewScanner(source)
			scanner.Buffer(make([]byte, 64<<10), maxRowBytes+1)
			for scanner.Scan() {
				var expected []*string
				if json.Unmarshal(scanner.Bytes(), &expected) != nil || len(expected) != len(table.Columns) || !rows.Next() {
					source.Close()
					rows.Close()
					return errors.New("候选逻辑行集合与备份不符")
				}
				actual, e := rows.Values()
				if e != nil {
					source.Close()
					rows.Close()
					return e
				}
				for i, col := range table.Columns {
					var want *string = expected[i]
					if table.Name == "config_release_version" && col == "storage_bucket" {
						want = &snapshotBucket
					}
					if table.Name == "config_release_version" && col == "legacy_local" {
						v := "false"
						want = &v
					}
					if table.Name == "config_release_head" && col == "last_version_number" {
						text, ok := actual[i].(string)
						if !ok || want == nil {
							e = errors.New("版本编号类型无效")
							break
						}
						before, err := strconv.ParseInt(*want, 10, 64)
						after, err2 := strconv.ParseInt(text, 10, 64)
						if err != nil || err2 != nil || after < before {
							e = errors.New("候选版本编号倒退")
							break
						}
						continue
					}
					if want == nil {
						if actual[i] != nil {
							e = errors.New("候选空值改变")
							break
						}
						continue
					}
					text, ok := actual[i].(string)
					if !ok || text != *want {
						e = fmt.Errorf("候选业务字段与备份不一致: %s.%s", table.Name, col)
						break
					}
				}
				if e != nil {
					source.Close()
					rows.Close()
					return e
				}
			}
			e = scanner.Err()
			source.Close()
			if e != nil {
				rows.Close()
				return e
			}
		}
		extra := rows.Next()
		e := rows.Err()
		rows.Close()
		if e != nil {
			return e
		}
		if extra {
			return errors.New("候选存在额外业务行")
		}
	}
	return nil
}
