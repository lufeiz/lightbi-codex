package main

import (
	"log"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/database"
	"lightbi/backend/internal/router"
)

func main() {
	cfg := config.Load()

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}

	if err := database.Migrate(db); err != nil {
		log.Fatalf("migrate database: %v", err)
	}

	if err := database.SeedDefaults(db, cfg); err != nil {
		log.Fatalf("seed defaults: %v", err)
	}

	engine := router.Setup(cfg, db)
	if err := engine.Run(cfg.AppAddr); err != nil {
		log.Fatalf("run server: %v", err)
	}
}
