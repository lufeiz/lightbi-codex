package main

import (
	"context"
	"log"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/database"
	"lightbi/backend/internal/router"
	"lightbi/backend/internal/services"
)

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("invalid configuration: %v", err)
	}

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}

	if cfg.RunAutoMigrate {
		if err := database.Migrate(db); err != nil {
			log.Fatalf("migrate database: %v", err)
		}
	}

	if cfg.RunSeedDefaults {
		if err := database.SeedDefaults(db, cfg); err != nil {
			log.Fatalf("seed defaults: %v", err)
		}
	}

	if cfg.QueryScheduler {
		services.StartDatasetQueryScheduler(context.Background(), db, cfg)
	}

	engine := router.Setup(cfg, db)
	if err := engine.Run(cfg.AppAddr); err != nil {
		log.Fatalf("run server: %v", err)
	}
}
