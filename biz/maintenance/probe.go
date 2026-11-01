package maintenance

import (
	"errors"
	"io"
	"net/http"
	"strconv"
)

type podIdentity struct {
	Authority           string
	Generation, Session int64
	Fingerprint         string
	Checking            bool
}

func probeIdentity(r *http.Response) (podIdentity, error) {
	defer r.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 4096))
	var id podIdentity
	var e error
	if r.Header.Get("X-Rainbow-Maintenance-Protocol") != "1" {
		return id, errors.New("Pod 未接入维护协议")
	}
	id.Generation, e = strconv.ParseInt(r.Header.Get("X-Rainbow-Generation"), 10, 64)
	if e != nil {
		return id, e
	}
	id.Session, e = strconv.ParseInt(r.Header.Get("X-Rainbow-Session-Generation"), 10, 64)
	if e != nil {
		return id, e
	}
	id.Checking, e = strconv.ParseBool(r.Header.Get("X-Rainbow-Checking"))
	if e != nil {
		return id, e
	}
	id.Fingerprint = r.Header.Get("X-Rainbow-Data-Fingerprint")
	id.Authority = r.Header.Get("X-Rainbow-Auth-Authority")
	if id.Generation < 1 || id.Session < 1 || len(id.Fingerprint) != 64 || (!id.Checking && r.StatusCode != 200) || (id.Checking && r.StatusCode != 503) {
		return id, errors.New("Pod 健康与维护代次不一致")
	}
	return id, nil
}
