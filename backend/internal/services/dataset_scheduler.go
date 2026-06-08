package services

import (
	"context"
	"log"
	"time"

	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/models"
)

func StartDatasetQueryScheduler(ctx context.Context, db *gorm.DB, cfg config.Config) {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			runDatasetRefreshTick(ctx, db, cfg)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func runDatasetRefreshTick(ctx context.Context, db *gorm.DB, cfg config.Config) {
	var datasets []models.Dataset
	err := db.Where("refresh_every > 0 AND type = ? AND data_source_id IS NOT NULL", models.DatasetTypeSQL).Find(&datasets).Error
	if err != nil {
		log.Printf("dataset scheduler list failed: %v", err)
		return
	}
	now := time.Now()
	for _, dataset := range datasets {
		if dataset.LastRefreshAt != nil && dataset.LastRefreshAt.Add(time.Duration(dataset.RefreshEvery)*time.Second).After(now) {
			continue
		}
		if _, err := ExecuteDatasetQuery(ctx, db, cfg, DatasetQueryContext{
			ProjectID: dataset.ProjectID,
			Source:    DatasetQuerySourceScheduler,
		}, dataset.ID, DatasetQueryRequest{Limit: dataset.RowLimit}); err != nil {
			log.Printf("dataset scheduler refresh dataset %d failed: %v", dataset.ID, err)
			continue
		}
		_ = db.Model(&models.Dataset{}).Where("id = ?", dataset.ID).Update("last_refresh_at", now).Error
	}
}
