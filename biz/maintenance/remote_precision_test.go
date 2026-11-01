package maintenance

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

// Opt-in: only an exclusively provisioned maintenance control DB is accepted.
// The test creates a TEMP table, never a business table or shared schema object.
func TestRemotePostgresExactLogicalTypes(t *testing.T) {
	file := os.Getenv("RB_MAINTENANCE_TEST_CONFIG")
	if file == "" {
		t.Skip("requires exclusive maintenance control fixture")
	}
	cfg, err := LoadConfig(file)
	if err != nil {
		t.Fatal("exclusive config invalid")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	c, err := openControl(ctx, cfg.ControlDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer closePG(c)
	var owned bool
	if c.QueryRow(ctx, `SELECT shobj_description(r.oid,'pg_authid')=$1 AND r.oid=d.datdba FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`, "rainbow-maintenance:"+cfg.InstanceID).Scan(&owned) != nil || !owned {
		t.Fatal("control role ownership not proved")
	}
	if _, err = c.Exec(ctx, `SET TIME ZONE 'UTC';CREATE TEMP TABLE rb_exact_types(n bigint,d numeric,t timestamptz,b bytea,v text,z text,flag boolean)`); err != nil {
		t.Fatal("temporary table unavailable")
	}
	input := "[\"9223372036854775807\",\"1234567890.12345678901234567890\",\"2026-10-30 00:01:02.123456+00\",\"\\\\x000102ff\",\"\\\\N\",null,\"false\"]\n"
	var csv strings.Builder
	if _, err = copyRows(ctx, strings.NewReader(input), &csv, 7); err != nil {
		t.Fatal(err)
	}
	tag, err := c.PgConn().CopyFrom(ctx, strings.NewReader(csv.String()), `COPY rb_exact_types FROM STDIN WITH(FORMAT csv,NULL '\N')`)
	if err != nil || tag.RowsAffected() != 1 {
		t.Fatal("exact typed COPY failed")
	}
	var n, d, ts, b, v string
	var z *string
	var flag bool
	if c.QueryRow(ctx, `SELECT n::text,d::text,to_char(t,'YYYY-MM-DD HH24:MI:SS.US'),encode(b,'hex'),v,z,flag FROM rb_exact_types`).Scan(&n, &d, &ts, &b, &v, &z, &flag) != nil {
		t.Fatal("typed readback failed")
	}
	if n != "9223372036854775807" || d != "1234567890.12345678901234567890" || ts != "2026-10-30 00:01:02.123456" || b != "000102ff" || v != "\\N" || z != nil || flag {
		t.Fatal("integer/decimal/timestamp/bytea/text/null/bool changed")
	}
	_, err = c.PgConn().CopyFrom(ctx, strings.NewReader("\"9223372036854775808\",\\N,\\N,\\N,\\N,\\N,\\N\n"), `COPY rb_exact_types FROM STDIN WITH(FORMAT csv,NULL '\N')`)
	if err == nil {
		t.Fatal("bigint overflow accepted")
	}
	var count int
	if c.QueryRow(ctx, `SELECT count(*) FROM rb_exact_types`).Scan(&count) != nil || count != 1 {
		t.Fatal("invalid COPY changed existing rows")
	}
	t.Log("real PG16: exact bigint, decimal scale, microsecond timestamp, bytea, literal NULL marker, SQL NULL and boolean; overflow rejected atomically")
}
