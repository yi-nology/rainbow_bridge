package maintcontrol

import (
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"testing"
)

func TestFingerprintBindsDestinationsAndExcludesCredentials(t *testing.T) {
	c := &config.Config{Database: config.DatabaseConfig{Driver: "postgres", Postgres: config.PostgresConfig{DSN: "host=127.0.0.1 user=app password=one dbname=business"}}, Storage: config.StorageConfig{Type: "minio", Minio: config.MinioConfig{Endpoint: "localhost:9000", Bucket: "original"}}, ReleaseStorage: config.ReleaseStorageConfig{Type: "minio", Bucket: "snapshots"}}
	original, e := Fingerprint(c)
	if e != nil {
		t.Fatal(e)
	}
	c.Database.Postgres.DSN = "host=127.0.0.1 user=app password=two dbname=business"
	same, e := Fingerprint(c)
	if e != nil || same != original {
		t.Fatal("secret rotation changed data identity")
	}
	c.Database.Postgres.DSN = "host=127.0.0.1 user=app dbname=wrong"
	different, e := Fingerprint(c)
	if e != nil || different == original {
		t.Fatal("wrong database accepted as same generation")
	}
	c.Storage.Type = "local"
	if _, e = Fingerprint(c); e == nil {
		t.Fatal("local storage accepted")
	}
}
