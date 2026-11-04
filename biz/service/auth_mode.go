package service

import "github.com/yi-nology/rainbow_bridge/pkg/config"

func (s *Service) AuthenticationEnabled() bool {
	if s.auth != nil && s.auth.Enabled != nil {
		return *s.auth.Enabled
	}
	return config.AuthEnabled(s.config)
}

// AnonymousAdmin is server-owned and never persisted as an administrator account.
func AnonymousAdmin() AdminIdentity {
	return AdminIdentity{UserID: 0, Username: "anonymous-admin", Role: "admin", AuthenticationSource: "disabled"}
}
