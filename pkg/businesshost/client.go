package businesshost

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"time"
)

func LocalStatus(ctx context.Context, socket string, key []byte, instance, pod string) (Status, error) {
	transport := &http.Transport{DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socket)
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 2 * time.Second}
	return ReadStatus(ctx, client, "http://host", key, instance, pod)
}

func ReadStatus(ctx context.Context, client *http.Client, endpoint string, key []byte, instance, pod string) (Status, error) {
	var status Status
	body, _ := json.Marshal(Command{Instance: instance, PodUID: pod, Action: "status"})
	r, e := http.NewRequestWithContext(ctx, "POST", endpoint+"/v1/command", bytes.NewReader(body))
	if e != nil {
		return status, e
	}
	Sign(r, body, key, time.Now())
	res, e := client.Do(r)
	if e != nil {
		return status, errors.New("business host IPC unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return status, errors.New("business host authentication unavailable")
	}
	e = json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&status)
	if e != nil || status.Protocol != Protocol || status.PodUID != pod {
		return status, errors.New("business host identity mismatch")
	}
	return status, nil
}
