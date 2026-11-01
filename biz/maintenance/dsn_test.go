package maintenance

import (
	"github.com/jackc/pgx/v5"
	"testing"
)

func TestDatabaseDSNActuallyChangesTarget(t *testing.T) {
	for _, source := range []string{"host=127.0.0.1 user=app password='quoted secret' dbname=old sslmode=disable", "postgres://app:secret@localhost:5432/old?sslmode=disable", "postgresql://app:secret@localhost:5432/old?dbname=old&sslmode=disable"} {
		want, e := DatabaseDSN(source, "rb_restore_new")
		if e != nil {
			t.Fatal(e)
		}
		got, e := pgx.ParseConfig(want)
		if e != nil || got.Database != "rb_restore_new" {
			t.Fatal("candidate still targets original database")
		}
		old, _ := pgx.ParseConfig(source)
		if got.User != old.User || got.Password != old.Password || got.Host != old.Host || got.Port != old.Port {
			t.Fatal("database rewrite modified credentials or endpoint")
		}
	}
	if _, e := DatabaseDSN("host=localhost dbname=old", "old' sslmode=disable"); e == nil {
		t.Fatal("invalid database accepted")
	}
}
