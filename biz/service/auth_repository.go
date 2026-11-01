package service

import (
	"context"
	"errors"
	"fmt"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/database"
	"gorm.io/gorm"
	"time"
)

// Authentication has one repository per deployment; business restore never selects it.
func (s *Service) authenticationDB() *gorm.DB {
	if s.authRepository != nil {
		return s.authRepository
	}
	return s.logic.db
}

// NewAuthenticationService does not open or migrate a business database.
func NewAuthenticationService(ctx context.Context, cfg *config.Config) (*Service, error) {
	s := &Service{logic: NewLogic(nil, nil), config: cfg, basePath: cfg.Server.BasePath, loginRate: newAuthRateLimiter(nil), passwordOps: newAuthComputeLimiter(authPasswordConcurrent)}
	if err := s.OpenAuthenticationRepository(ctx); err != nil {
		return nil, err
	}
	return s, nil
}
func (s *Service) UseAuthenticationRepository(ctx context.Context, conn *gorm.DB) error {
	if s.config == nil || !s.config.Backup.Distributed.WebEnabled {
		return errors.New("控制认证模式未启用")
	}
	var restricted bool
	if e := conn.WithContext(ctx).Raw(`SELECT NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT has_schema_privilege(current_user,'public','CREATE') AND NOT has_table_privilege(current_user,'rb_maintenance_operation','INSERT,UPDATE,DELETE') AND NOT has_table_privilege(current_user,'rb_maintenance_backup','INSERT,UPDATE,DELETE') AND NOT has_table_privilege(current_user,'rb_auth_authority','INSERT,UPDATE,DELETE') FROM pg_roles r WHERE r.rolname=current_user`).Scan(&restricted).Error; e != nil || !restricted {
		return errors.New("认证身份权限过大或控制结构未初始化")
	}
	s.authRepository = conn
	_, _, _, err := s.AuthorityState(ctx)
	return err
}
func (s *Service) OpenAuthenticationRepository(ctx context.Context) error {
	if s.config == nil || !s.config.Backup.Distributed.WebEnabled {
		return nil
	}
	c := s.config.Backup.Distributed
	if !c.Enabled || c.AuthDSN == "" {
		return errors.New("网页模式必须配置独立认证连接")
	}
	cfg := config.DatabaseConfig{Driver: "postgres"}
	cfg.Postgres.DSN = c.AuthDSN
	conn, err := database.Open(cfg)
	if err != nil {
		return errors.New("控制认证连接不可用")
	}
	sqlDB, _ := conn.DB()
	sqlDB.SetMaxOpenConns(6)
	sqlDB.SetMaxIdleConns(2)
	if err = s.UseAuthenticationRepository(ctx, conn); err != nil {
		sqlDB.Close()
		return err
	}
	return nil
}

// AuthorityState fails closed; epoch is independent of a restored business database.
func (s *Service) AuthorityState(ctx context.Context) (epoch int64, mode string, operation string, err error) {
	if s.config == nil || !s.config.Backup.Distributed.WebEnabled {
		return 0, "active", "", nil
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if s.authRepository == nil {
		return 0, "", "", errors.New("认证权威未就绪")
	}
	var row struct {
		Epoch     int64
		Mode      string
		Operation string
	}
	err = s.authRepository.WithContext(ctx).Raw(`SELECT a.session_epoch epoch,i.mode,COALESCE(i.operation_id::text,'') operation FROM rb_auth_authority a JOIN rb_maintenance_instance i USING(instance_id) WHERE a.instance_id=? AND a.schema_version=1 AND a.state='active'`, s.config.Backup.Distributed.InstanceID).Scan(&row).Error
	if err != nil || row.Epoch < 1 {
		return 0, "", "", errors.New("控制认证权威不可用")
	}
	return row.Epoch, row.Mode, row.Operation, nil
}
func (s *Service) authRepositoryReady(ctx context.Context) error {
	_, _, _, err := s.AuthorityState(ctx)
	if err != nil {
		return authUnavailableError(err)
	}
	return nil
}
func (s *Service) AuthenticationAccess(ctx context.Context) (string, string, error) {
	_, mode, op, err := s.AuthorityState(ctx)
	if err != nil {
		return "", "", err
	}
	if mode != "active" {
		return "maintenance", op, nil
	}
	return "admin", "", nil
}
func (s *Service) authorityTokenHash(token string) string {
	epoch, _, _, err := s.AuthorityState(context.Background())
	if err != nil {
		return sessionTokenHash("unavailable:" + token)
	}
	return s.authorityTokenHashAt(token, epoch)
}
func (s *Service) authorityTokenHashAt(token string, epoch int64) string {
	return sessionTokenHash(fmt.Sprintf("%s:auth%d:%s", s.config.Backup.Distributed.InstanceID, epoch, token))
}
