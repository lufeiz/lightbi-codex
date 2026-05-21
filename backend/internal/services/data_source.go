package services

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"
	_ "github.com/jackc/pgx/v5/stdlib"

	"lightbi/backend/internal/models"
)

func OpenDataSource(ctx context.Context, source models.DataSource, credentialKey string) (*sql.DB, error) {
	password, err := DecryptSecret(credentialKey, source.PasswordCiphertext)
	if err != nil {
		return nil, err
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
		return nil, err
	}
	return db, nil
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
