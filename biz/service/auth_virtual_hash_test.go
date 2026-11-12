package service

import (
	"sync"
	"testing"
)

// Regression for issue #35: the virtual hash that equalizes verification cost
// for unknown accounts is lazy-initialized. The previous implementation read
// and wrote an unsynchronized closure variable, so concurrent first logins
// raced (DATA RACE under -race) and each goroutine ran its own Argon2 pass —
// the "generated once" contract was broken on the very first concurrent use.
func TestAuthVirtualHashConcurrentFirstInit(t *testing.T) {
	resetAuthVirtualHashForTest()
	defer resetAuthVirtualHashForTest()

	const workers = 8
	results := make([]string, workers)
	var start, done sync.WaitGroup
	start.Add(1)
	for i := 0; i < workers; i++ {
		done.Add(1)
		go func(i int) {
			defer done.Done()
			start.Wait()
			results[i] = authVirtualHashOnce()
		}(i)
	}
	start.Done()
	done.Wait()

	first := results[0]
	if first == "" {
		t.Fatal("virtual hash not generated")
	}
	for i, got := range results {
		if got != first {
			t.Fatalf("worker %d observed a different virtual hash: initialization ran more than once", i)
		}
	}
}
