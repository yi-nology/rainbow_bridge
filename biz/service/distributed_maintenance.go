package service

import (
	"context"
	"fmt"
)

func (s *Service) CheckDistributedMaintenance(ctx context.Context, allowChecking bool) (bool, error) {
	if s.controlErr != nil {
		return false, s.controlErr
	}
	return s.control.Check(ctx, allowChecking)
}
func (s *Service) CloseDistributedControl() {
	s.control.Close()
	if s.authRepository != nil {
		if db, e := s.authRepository.DB(); e == nil {
			_ = db.Close()
		}
	}
}
func (s *Service) TrackDistributedRequest() func() { return s.control.Track() }
func (s *Service) DistributedInFlight() int64      { return s.control.InFlight() }

func (s *Service) sessionTokenHash(token string) string {
	if s.config != nil && s.config.Backup.Distributed.WebEnabled {
		return s.authorityTokenHash(token)
	}
	if s.config != nil && s.config.Backup.Distributed.Enabled {
		c := s.config.Backup.Distributed
		token = fmt.Sprintf("%s:s%d:%s", c.InstanceID, c.SessionGeneration, token)
	}
	return sessionTokenHash(token)
}
