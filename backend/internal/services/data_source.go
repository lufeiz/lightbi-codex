package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"
	_ "github.com/jackc/pgx/v5/stdlib"

	"lightbi/backend/internal/models"
)

func OpenDataSource(ctx context.Context, source models.DataSource, credentialKey string) (*sql.DB, error) {
	if err := ValidateDataSourceTarget(ctx, source, nil, false); err != nil {
		return nil, err
	}
	password, err := DecryptSecret(credentialKey, source.PasswordCiphertext)
	if err != nil {
		return nil, errors.New("data source credential is invalid")
	}
	dsn, err := DataSourceDSN(source, password)
	if err != nil {
		return nil, err
	}

	driverName := ""
	switch source.Type {
	case models.DataSourceTypeMySQL:
		driverName = "mysql"
	case models.DataSourceTypePostgres:
		driverName = "pgx"
	default:
		return nil, fmt.Errorf("unsupported data source type %s", source.Type)
	}
	db, err := sql.Open(driverName, dsn)
	if err != nil {
		return nil, err
	}

	if source.MaxOpenConns > 0 {
		db.SetMaxOpenConns(source.MaxOpenConns)
	}
	if source.MaxIdleConns > 0 {
		db.SetMaxIdleConns(source.MaxIdleConns)
	}
	if source.ConnMaxLifetimeSecs > 0 {
		db.SetConnMaxLifetime(time.Duration(source.ConnMaxLifetimeSecs) * time.Second)
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, errors.New("data source connection failed")
	}
	return db, nil
}

func OpenDataSourceWithNetworkPolicy(ctx context.Context, source models.DataSource, credentialKey string, allowedHosts []string, blockPrivateNetworks bool) (*sql.DB, error) {
	if err := ValidateDataSourceTarget(ctx, source, allowedHosts, blockPrivateNetworks); err != nil {
		return nil, err
	}
	return OpenDataSource(ctx, source, credentialKey)
}

func CloseDataSource(db *sql.DB) {
	if db != nil {
		_ = db.Close()
	}
}

func DataSourceDSN(source models.DataSource, password string) (string, error) {
	if source.Host == "" || source.Port <= 0 || source.DatabaseName == "" || source.Username == "" {
		return "", fmt.Errorf("data source connection fields are incomplete")
	}
	switch source.Type {
	case models.DataSourceTypeMySQL:
		cfg := mysqlDriver.NewConfig()
		cfg.User = source.Username
		cfg.Passwd = password
		cfg.Net = "tcp"
		cfg.Addr = net.JoinHostPort(source.Host, strconv.Itoa(source.Port))
		cfg.DBName = source.DatabaseName
		cfg.ParseTime = true
		cfg.Params = map[string]string{"charset": "utf8mb4", "loc": "Local"}
		return cfg.FormatDSN(), nil
	case models.DataSourceTypePostgres:
		sslMode := source.SSLMode
		if sslMode == "" {
			sslMode = "disable"
		}
		u := url.URL{
			Scheme: "postgres",
			User:   url.UserPassword(source.Username, password),
			Host:   net.JoinHostPort(source.Host, strconv.Itoa(source.Port)),
			Path:   source.DatabaseName,
		}
		query := u.Query()
		query.Set("sslmode", sslMode)
		u.RawQuery = query.Encode()
		return u.String(), nil
	default:
		return "", fmt.Errorf("unsupported data source type %s", source.Type)
	}
}

func ValidateDataSourceTarget(ctx context.Context, source models.DataSource, allowedHosts []string, blockPrivateNetworks bool) error {
	host := strings.TrimSpace(source.Host)
	if host == "" {
		return errors.New("data source host is required")
	}
	if len(allowedHosts) > 0 && !dataSourceHostAllowed(host, allowedHosts) {
		return errors.New("data source host is not in the allowed list")
	}
	if !blockPrivateNetworks {
		return nil
	}
	if ip, ok := parseHostIP(host); ok {
		if !isPublicDataSourceIP(ip) {
			return errors.New("data source host resolves to a private or unsafe network")
		}
		return nil
	}
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return errors.New("data source host resolution failed")
	}
	if len(addrs) == 0 {
		return errors.New("data source host resolution failed")
	}
	for _, addr := range addrs {
		ip, ok := parseHostIP(addr.IP.String())
		if !ok || !isPublicDataSourceIP(ip) {
			return errors.New("data source host resolves to a private or unsafe network")
		}
	}
	return nil
}

func dataSourceHostAllowed(host string, allowedHosts []string) bool {
	host = normalizeDataSourceHost(host)
	hostIP, hostIsIP := parseHostIP(host)
	for _, allowed := range allowedHosts {
		allowed = normalizeDataSourceHost(allowed)
		if allowed == "" {
			continue
		}
		if host == allowed {
			return true
		}
		if strings.HasPrefix(allowed, "*.") && strings.HasSuffix(host, strings.TrimPrefix(allowed, "*")) {
			return true
		}
		if hostIsIP {
			if prefix, err := netip.ParsePrefix(allowed); err == nil && prefix.Contains(hostIP) {
				return true
			}
		}
	}
	return false
}

func normalizeDataSourceHost(host string) string {
	host = strings.TrimSpace(strings.ToLower(host))
	if strings.HasPrefix(host, "[") && strings.Contains(host, "]") {
		if parsed, _, err := net.SplitHostPort(host); err == nil {
			return strings.Trim(parsed, "[]")
		}
	}
	if parsed, _, err := net.SplitHostPort(host); err == nil {
		return parsed
	}
	return strings.Trim(host, "[]")
}

func parseHostIP(host string) (netip.Addr, bool) {
	ip, err := netip.ParseAddr(normalizeDataSourceHost(host))
	if err != nil {
		return netip.Addr{}, false
	}
	return ip.Unmap(), true
}

func isPublicDataSourceIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	return ip.IsGlobalUnicast() &&
		!ip.IsPrivate() &&
		!ip.IsLoopback() &&
		!ip.IsLinkLocalUnicast() &&
		!ip.IsLinkLocalMulticast() &&
		!ip.IsMulticast() &&
		!ip.IsUnspecified()
}
