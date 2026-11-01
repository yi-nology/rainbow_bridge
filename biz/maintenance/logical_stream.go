package maintenance

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/yi-nology/rainbow_bridge/biz/backup"
	"io"
	"os"
	"strings"
)

const maxRowBytes = 8 << 20

func quotedColumns(columns []string) string {
	v := make([]string, len(columns))
	for i, c := range columns {
		v[i] = pgx.Identifier{c}.Sanitize()
	}
	return strings.Join(v, ",")
}

var allowedTypes = map[string]bool{"boolean": true, "bytea": true, "bigint": true, "integer": true, "smallint": true, "text": true, "character varying": true, "timestamp without time zone": true, "timestamp with time zone": true, "numeric": true}

func tableTypes(ctx context.Context, db *pgx.Conn, name string, columns []string) ([]string, error) {
	rows, err := db.Query(ctx, `SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	types := map[string]string{}
	for rows.Next() {
		var col, typ string
		if err = rows.Scan(&col, &typ); err != nil {
			return nil, err
		}
		types[col] = typ
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	result := make([]string, len(columns))
	for i, col := range columns {
		t, ok := types[col]
		if !ok || !allowedTypes[t] {
			return nil, errors.New("业务表缺列或包含不支持的精确类型")
		}
		result[i] = t
	}
	return result, nil
}

// ExportLogical serializes each value as PostgreSQL's text representation or
// null, plus a trusted type catalog. Integers never pass through JSON float64.
func ExportLogical(ctx context.Context, db *pgx.Conn, store *Store, l *Lease, prefix string) ([]Table, error) {
	tx, err := db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, `SET LOCAL TIME ZONE 'UTC'`); err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `SET LOCAL DateStyle='ISO,YMD';SET LOCAL bytea_output='hex'`); err != nil {
		return nil, err
	}
	var result []Table
	for _, spec := range backup.BusinessTableAllowlist() {
		t := Table{Name: spec.Name, Columns: spec.Columns, Files: []File{}}
		t.Types, err = tableTypes(ctx, db, spec.Name, spec.Columns)
		if err != nil {
			return nil, err
		}
		expressions := make([]string, len(t.Columns))
		for i, col := range t.Columns {
			expressions[i] = pgx.Identifier{col}.Sanitize() + "::text"
		}
		rows, err := tx.Query(ctx, "SELECT "+strings.Join(expressions, ",")+" FROM "+pgx.Identifier{"public", t.Name}.Sanitize()+" ORDER BY id")
		if err != nil {
			return nil, err
		}
		file, err := os.CreateTemp("", "rb-maint-data-*")
		if err != nil {
			rows.Close()
			return nil, err
		}
		var bytes int64
		var count int64
		part := 0
		flush := func() error {
			if err := file.Close(); err != nil {
				return err
			}
			key := fmt.Sprintf("%sdata/%s/%06d.ndjson", prefix, t.Name, part)
			f, e := store.putFile(ctx, l, store.backup, key, file.Name())
			os.Remove(file.Name())
			if e != nil {
				return e
			}
			f.Rows = count
			t.Files = append(t.Files, f)
			part++
			bytes = 0
			count = 0
			return nil
		}
		for rows.Next() {
			values, e := rows.Values()
			if e != nil {
				err = e
				break
			}
			encoded, e := json.Marshal(values)
			if e != nil {
				err = e
				break
			}
			if len(encoded) > maxRowBytes {
				err = errors.New("单行业务数据超过 8MiB 限额")
				break
			}
			if bytes > 0 && bytes+int64(len(encoded)+1) > 16<<20 {
				if err = flush(); err != nil {
					break
				}
				file, err = os.CreateTemp("", "rb-maint-data-*")
				if err != nil {
					break
				}
			}
			if _, err = file.Write(append(encoded, '\n')); err != nil {
				break
			}
			bytes += int64(len(encoded) + 1)
			count++
			t.Rows++
		}
		if err == nil {
			err = rows.Err()
		}
		rows.Close()
		if err == nil {
			err = flush()
		}
		if file != nil {
			file.Close()
			os.Remove(file.Name())
		}
		if err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

// DecodeRows rejects unknown fields, scalar values, missing columns, numbers and
// overlong rows. COPY receives only quoted literal fields, never backup SQL.
func copyRows(ctx context.Context, source io.Reader, target io.Writer, width int) (int64, error) {
	scanner := bufio.NewScanner(source)
	scanner.Buffer(make([]byte, 64<<10), maxRowBytes+1)
	var count int64
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return count, err
		}
		var row []*string
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil || len(row) != width {
			return count, errors.New("逻辑行字段数量或精确类型无效")
		}
		for i, v := range row {
			if i > 0 {
				if _, err := io.WriteString(target, ","); err != nil {
					return count, err
				}
			}
			field := "\\N"
			if v != nil {
				field = "\"" + strings.ReplaceAll(*v, "\"", "\"\"") + "\""
			}
			if _, err := io.WriteString(target, field); err != nil {
				return count, err
			}
		}
		if _, err := io.WriteString(target, "\n"); err != nil {
			return count, err
		}
		count++
	}
	return count, scanner.Err()
}
func ImportLogical(ctx context.Context, db *pgx.Conn, store *Store, tables []Table) error {
	allowed := backup.BusinessTableAllowlist()
	if len(tables) != len(allowed) {
		return errors.New("业务表清单不完整")
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	for i, t := range tables {
		spec := allowed[i]
		if t.Name != spec.Name || strings.Join(t.Columns, "\x00") != strings.Join(spec.Columns, "\x00") {
			return errors.New("逻辑表或字段不在编译期 allowlist")
		}
		types, err := tableTypes(ctx, db, t.Name, t.Columns)
		if err != nil || strings.Join(types, "\x00") != strings.Join(t.Types, "\x00") {
			return errors.New("恢复目标类型与备份不兼容")
		}
		var total int64
		for _, f := range t.Files {
			if err = store.verify(ctx, store.backup, f); err != nil {
				return err
			}
			source, e := store.read(ctx, store.backup, f.Key, "")
			if e != nil {
				return e
			}
			reader, writer := io.Pipe()
			done := make(chan error, 1)
			go func() {
				count, e := copyRows(ctx, source, writer, len(t.Columns))
				source.Close()
				if e == nil && count != f.Rows {
					e = errors.New("逻辑分片行数不符")
				}
				writer.CloseWithError(e)
				done <- e
			}()
			command := "COPY " + pgx.Identifier{"public", t.Name}.Sanitize() + " (" + quotedColumns(t.Columns) + ") FROM STDIN WITH (FORMAT csv, NULL '\\N')"
			tag, e := tx.Conn().PgConn().CopyFrom(ctx, reader, command)
			reader.CloseWithError(e)
			copyErr := <-done
			if e != nil || copyErr != nil || tag.RowsAffected() != f.Rows {
				return errors.New("逻辑分片导入或精确类型校验失败")
			}
			total += f.Rows
		}
		if total != t.Rows {
			return errors.New("业务表总行数不匹配")
		}
	}
	return tx.Commit(ctx)
}
