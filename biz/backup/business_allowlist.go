package backup

// BusinessTableSpec exports the same frozen schema-4 business allowlist to the
// maintenance logical stream. Authentication and execution state are excluded.
type BusinessTableSpec struct {
	Name    string
	Columns []string
}

func BusinessTableAllowlist() []BusinessTableSpec {
	result := make([]BusinessTableSpec, len(businessTables))
	for i, t := range businessTables {
		result[i] = BusinessTableSpec{t.Name, append([]string(nil), t.Columns...)}
	}
	return result
}
