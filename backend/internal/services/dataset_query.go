package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/models"
)

type DatasetQueryRequest struct {
	Dimensions     []string      `json:"dimensions"`
	Metrics        []QueryMetric `json:"metrics"`
	Filters        []QueryFilter `json:"filters"`
	Sorts          []QuerySort   `json:"sorts"`
	TopN           int           `json:"topN"`
	Limit          int           `json:"limit"`
	TimeComparison string        `json:"timeComparison"`
}

type QueryMetric struct {
	Field       string `json:"field"`
	Aggregation string `json:"aggregation"`
	Alias       string `json:"alias"`
}

type QueryFilter struct {
	Field    string `json:"field"`
	Operator string `json:"operator"`
	Value    any    `json:"value"`
	Values   []any  `json:"values"`
}

type QuerySort struct {
	Field string `json:"field"`
	Order string `json:"order"`
}

type DatasetQueryColumn struct {
	Name  string `json:"name"`
	Label string `json:"label"`
	Role  string `json:"role"`
	Type  string `json:"type"`
}

type DatasetQueryResponse struct {
	Columns    []DatasetQueryColumn `json:"columns"`
	Rows       []map[string]any     `json:"rows"`
	Cached     bool                 `json:"cached"`
	ExecutedAt time.Time            `json:"executedAt"`
	ExpiresAt  *time.Time           `json:"expiresAt,omitempty"`
}

type datasetFieldMeta struct {
	Name  string `json:"name"`
	Label string `json:"label"`
	Type  string `json:"type"`
	Role  string `json:"role"`
}

var (
	datasetQueryGateMu sync.Mutex
	datasetQueryGates  = map[int]chan struct{}{}

	datasetQueryLogPruneMu    sync.Mutex
	datasetQueryLogLastPruned time.Time
)

var forbiddenSQLKeywordPattern = regexp.MustCompile(`(?i)\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|call|execute)\b`)

const (
	datasetQueryLogWriteTimeout         = 2 * time.Second
	datasetQueryLogPruneInterval        = time.Hour
	defaultDatasetQueryLogRetentionDays = 30
)

func ExecuteDatasetQuery(ctx context.Context, appDB *gorm.DB, cfg config.Config, datasetID uint, req DatasetQueryRequest) (response DatasetQueryResponse, err error) {
	start := time.Now()
	var dataset models.Dataset
	if err := appDB.Preload("DataSource").First(&dataset, datasetID).Error; err != nil {
		return DatasetQueryResponse{}, err
	}
	var normalizedReq DatasetQueryRequest
	var cacheKey string
	defer func() {
		if normalizedReq.Limit > 0 || len(normalizedReq.Dimensions) > 0 || len(normalizedReq.Metrics) > 0 {
			enqueueDatasetQueryLog(appDB, cfg.QueryLogRetentionDays, dataset, normalizedReq, cacheKey, response, err, time.Since(start))
		}
	}()
	normalizedReq, fields, err := normalizeDatasetQueryRequest(dataset, req)
	if err != nil {
		return DatasetQueryResponse{}, err
	}

	cacheKey, err = datasetQueryCacheKey(dataset.ID, normalizedReq)
	if err != nil {
		return DatasetQueryResponse{}, err
	}
	if dataset.CacheTTL > 0 {
		if cached, ok := loadDatasetQueryCache(appDB, dataset.ID, cacheKey); ok {
			cached.Cached = true
			response = cached
			return cached, nil
		}
	}

	release, err := acquireDatasetQuerySlot(ctx, cfg.QueryMaxConcurrent)
	if err != nil {
		return DatasetQueryResponse{}, err
	}
	defer release()

	timeout := dataset.QueryTimeout
	if timeout <= 0 {
		timeout = 10
	}
	queryCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	if dataset.Type == models.DatasetTypeSQL && dataset.DataSource != nil {
		response, err = executeSQLDatasetQuery(queryCtx, cfg, dataset, normalizedReq, fields)
	} else {
		response, err = executeLegacyDatasetQuery(dataset, normalizedReq, fields)
	}
	if err != nil {
		return DatasetQueryResponse{}, err
	}
	response.ExecutedAt = time.Now()

	if dataset.CacheTTL > 0 {
		expiresAt := time.Now().Add(time.Duration(dataset.CacheTTL) * time.Second)
		response.ExpiresAt = &expiresAt
		_ = saveDatasetQueryCache(appDB, dataset.ID, cacheKey, response, expiresAt)
	}
	return response, nil
}

func acquireDatasetQuerySlot(ctx context.Context, maxConcurrent int) (func(), error) {
	if maxConcurrent <= 0 {
		maxConcurrent = 8
	}
	datasetQueryGateMu.Lock()
	gate := datasetQueryGates[maxConcurrent]
	if gate == nil {
		gate = make(chan struct{}, maxConcurrent)
		datasetQueryGates[maxConcurrent] = gate
	}
	datasetQueryGateMu.Unlock()

	select {
	case gate <- struct{}{}:
		return func() { <-gate }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func enqueueDatasetQueryLog(appDB *gorm.DB, retentionDays int, dataset models.Dataset, req DatasetQueryRequest, queryHash string, response DatasetQueryResponse, queryErr error, duration time.Duration) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), datasetQueryLogWriteTimeout)
		defer cancel()
		_ = writeDatasetQueryLog(appDB.WithContext(ctx), retentionDays, dataset, req, queryHash, response, queryErr, duration)
	}()
}

func writeDatasetQueryLog(appDB *gorm.DB, retentionDays int, dataset models.Dataset, req DatasetQueryRequest, queryHash string, response DatasetQueryResponse, queryErr error, duration time.Duration) error {
	status := "success"
	errorMessage := ""
	if queryErr != nil {
		status = "failed"
		errorMessage = queryErr.Error()
		if len(errorMessage) > 500 {
			errorMessage = errorMessage[:500]
		}
	}
	requestSummary, _ := json.Marshal(map[string]any{
		"dimensions": req.Dimensions,
		"metrics":    req.Metrics,
		"filters":    len(req.Filters),
		"sorts":      req.Sorts,
		"topN":       req.TopN,
	})
	if err := appDB.Create(&models.DatasetQueryLog{
		DatasetID:      dataset.ID,
		WorkspaceID:    dataset.WorkspaceID,
		ProjectID:      dataset.ProjectID,
		DataSourceID:   dataset.DataSourceID,
		Status:         status,
		Cached:         response.Cached,
		DurationMs:     duration.Milliseconds(),
		RowCount:       len(response.Rows),
		Limit:          req.Limit,
		QueryHash:      queryHash,
		ErrorMessage:   errorMessage,
		RequestSummary: datatypes.JSON(requestSummary),
	}).Error; err != nil {
		return err
	}
	return maybePruneDatasetQueryLogs(appDB, retentionDays, time.Now())
}

func maybePruneDatasetQueryLogs(db *gorm.DB, retentionDays int, now time.Time) error {
	retentionDays = effectiveDatasetQueryLogRetentionDays(retentionDays)
	datasetQueryLogPruneMu.Lock()
	if !datasetQueryLogLastPruned.IsZero() && now.Sub(datasetQueryLogLastPruned) < datasetQueryLogPruneInterval {
		datasetQueryLogPruneMu.Unlock()
		return nil
	}
	datasetQueryLogLastPruned = now
	datasetQueryLogPruneMu.Unlock()
	return pruneDatasetQueryLogs(db, retentionDays, now)
}

func pruneDatasetQueryLogs(db *gorm.DB, retentionDays int, now time.Time) error {
	retentionDays = effectiveDatasetQueryLogRetentionDays(retentionDays)
	cutoff := now.AddDate(0, 0, -retentionDays)
	return db.Where("created_at < ?", cutoff).Delete(&models.DatasetQueryLog{}).Error
}

func effectiveDatasetQueryLogRetentionDays(retentionDays int) int {
	if retentionDays <= 0 {
		return defaultDatasetQueryLogRetentionDays
	}
	return retentionDays
}

func RefreshDatasetQueryCache(appDB *gorm.DB, datasetID uint) error {
	return appDB.Where("dataset_id = ?", datasetID).Delete(&models.DatasetQueryCache{}).Error
}

func normalizeDatasetQueryRequest(dataset models.Dataset, req DatasetQueryRequest) (DatasetQueryRequest, map[string]datasetFieldMeta, error) {
	fields, err := loadDatasetFields(dataset)
	if err != nil {
		return DatasetQueryRequest{}, nil, err
	}
	if len(req.Dimensions) == 0 {
		req.Dimensions = firstFieldsByRole(fields, "dimension", 1)
	}
	if len(req.Metrics) == 0 {
		for _, name := range firstFieldsByRole(fields, "measure", 1) {
			req.Metrics = append(req.Metrics, QueryMetric{Field: name, Aggregation: "sum"})
		}
	}
	if req.Limit <= 0 {
		req.Limit = dataset.RowLimit
	}
	if req.Limit <= 0 {
		req.Limit = 500
	}
	if req.Limit > 5000 {
		req.Limit = 5000
	}
	if req.TopN < 0 {
		req.TopN = 0
	}

	for _, dimension := range req.Dimensions {
		field, ok := fields[dimension]
		if !ok || field.Role != "dimension" {
			return DatasetQueryRequest{}, nil, fmt.Errorf("invalid dimension field %s", dimension)
		}
	}
	for index, metric := range req.Metrics {
		field, ok := fields[metric.Field]
		if !ok || field.Role != "measure" {
			return DatasetQueryRequest{}, nil, fmt.Errorf("invalid metric field %s", metric.Field)
		}
		aggregation := strings.ToLower(strings.TrimSpace(metric.Aggregation))
		if aggregation == "" {
			aggregation = "sum"
		}
		if !validAggregation(aggregation) {
			return DatasetQueryRequest{}, nil, fmt.Errorf("invalid metric aggregation %s", metric.Aggregation)
		}
		req.Metrics[index].Aggregation = aggregation
		if strings.TrimSpace(metric.Alias) == "" {
			req.Metrics[index].Alias = metric.Field + "_" + aggregation
		}
	}
	for _, filter := range req.Filters {
		if _, ok := fields[filter.Field]; !ok {
			return DatasetQueryRequest{}, nil, fmt.Errorf("invalid filter field %s", filter.Field)
		}
		if !validFilterOperator(filter.Operator) {
			return DatasetQueryRequest{}, nil, fmt.Errorf("invalid filter operator %s", filter.Operator)
		}
	}
	for index, sortItem := range req.Sorts {
		if strings.EqualFold(sortItem.Order, "asc") {
			req.Sorts[index].Order = "asc"
		} else {
			req.Sorts[index].Order = "desc"
		}
		if _, ok := fields[sortItem.Field]; ok {
			continue
		}
		if !metricAliasExists(req.Metrics, sortItem.Field) {
			return DatasetQueryRequest{}, nil, fmt.Errorf("invalid sort field %s", sortItem.Field)
		}
	}
	return req, fields, nil
}

func loadDatasetFields(dataset models.Dataset) (map[string]datasetFieldMeta, error) {
	fields := map[string]datasetFieldMeta{}
	if len(dataset.Fields) > 0 && string(dataset.Fields) != "null" {
		var parsed []datasetFieldMeta
		if err := json.Unmarshal(dataset.Fields, &parsed); err != nil {
			return nil, err
		}
		for _, field := range parsed {
			role := field.Role
			if role == "" {
				role = "dimension"
			}
			fields[field.Name] = datasetFieldMeta{Name: field.Name, Label: field.Label, Type: field.Type, Role: role}
		}
	}
	var dimensions []datasetFieldMeta
	var measures []datasetFieldMeta
	_ = json.Unmarshal(dataset.Dimensions, &dimensions)
	_ = json.Unmarshal(dataset.Measures, &measures)
	for _, field := range dimensions {
		fields[field.Name] = datasetFieldMeta{Name: field.Name, Label: field.Label, Type: field.Type, Role: "dimension"}
	}
	for _, field := range measures {
		fields[field.Name] = datasetFieldMeta{Name: field.Name, Label: field.Label, Type: field.Type, Role: "measure"}
	}
	return fields, nil
}

func executeSQLDatasetQuery(ctx context.Context, cfg config.Config, dataset models.Dataset, req DatasetQueryRequest, fields map[string]datasetFieldMeta) (DatasetQueryResponse, error) {
	baseSQL, err := NormalizeReadOnlySQL(dataset.QuerySQL)
	if err != nil {
		return DatasetQueryResponse{}, err
	}
	db, err := OpenDataSource(ctx, *dataset.DataSource, cfg.DataSourceKey)
	if err != nil {
		return DatasetQueryResponse{}, err
	}
	defer CloseDataSource(db)

	query, args, columns, err := BuildDatasetSQL(dataset.DataSource.Type, baseSQL, req, fields)
	if err != nil {
		return DatasetQueryResponse{}, err
	}
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return DatasetQueryResponse{}, err
	}
	defer rows.Close()
	result, err := scanSQLRows(rows)
	if err != nil {
		return DatasetQueryResponse{}, err
	}
	return DatasetQueryResponse{Columns: columns, Rows: result}, nil
}

func BuildDatasetSQL(sourceType models.DataSourceType, baseSQL string, req DatasetQueryRequest, fields map[string]datasetFieldMeta) (string, []any, []DatasetQueryColumn, error) {
	quote := "`"
	if sourceType == models.DataSourceTypePostgres {
		quote = `"`
	}
	var selects []string
	var groupBy []string
	var columns []DatasetQueryColumn
	for _, dimension := range req.Dimensions {
		expr := quoteIdentifier(dimension, quote)
		selects = append(selects, expr)
		groupBy = append(groupBy, expr)
		field := fields[dimension]
		columns = append(columns, DatasetQueryColumn{Name: dimension, Label: labelOrName(field), Role: "dimension", Type: field.Type})
	}
	for _, metric := range req.Metrics {
		alias := safeAlias(metric.Alias)
		selects = append(selects, fmt.Sprintf("%s(%s) AS %s", strings.ToUpper(metric.Aggregation), quoteIdentifier(metric.Field, quote), quoteIdentifier(alias, quote)))
		field := fields[metric.Field]
		columns = append(columns, DatasetQueryColumn{Name: alias, Label: labelOrName(field), Role: "measure", Type: "number"})
	}
	if len(selects) == 0 {
		return "", nil, nil, errors.New("query requires at least one dimension or metric")
	}

	args := []any{}
	whereClause, whereArgs := buildSQLFilters(req.Filters, quote)
	args = append(args, whereArgs...)
	sqlText := "SELECT " + strings.Join(selects, ", ") + " FROM (" + baseSQL + ") AS dataset_base"
	if whereClause != "" {
		sqlText += " WHERE " + whereClause
	}
	if len(groupBy) > 0 && len(req.Metrics) > 0 {
		sqlText += " GROUP BY " + strings.Join(groupBy, ", ")
	}
	if orderBy := buildSQLOrder(req, quote); orderBy != "" {
		sqlText += " ORDER BY " + orderBy
	}
	limit := req.Limit
	if req.TopN > 0 && (limit == 0 || req.TopN < limit) {
		limit = req.TopN
	}
	if limit > 0 {
		sqlText += " LIMIT ?"
		args = append(args, limit)
	}
	return sqlText, args, columns, nil
}

func executeLegacyDatasetQuery(dataset models.Dataset, req DatasetQueryRequest, fields map[string]datasetFieldMeta) (DatasetQueryResponse, error) {
	var sourceRows []map[string]any
	if err := json.Unmarshal(dataset.Rows, &sourceRows); err != nil {
		return DatasetQueryResponse{}, err
	}
	rows := applyLegacyFilters(sourceRows, req.Filters)
	grouped := map[string]map[string]any{}
	order := []string{}
	for _, row := range rows {
		keyParts := make([]string, 0, len(req.Dimensions))
		result := map[string]any{}
		for _, dimension := range req.Dimensions {
			value := row[dimension]
			keyParts = append(keyParts, fmt.Sprint(value))
			result[dimension] = value
		}
		key := strings.Join(keyParts, "\x00")
		current, ok := grouped[key]
		if !ok {
			current = result
			for _, metric := range req.Metrics {
				current[safeAlias(metric.Alias)] = legacyInitialMetric(metric.Aggregation)
				current["__count_"+safeAlias(metric.Alias)] = 0
			}
			grouped[key] = current
			order = append(order, key)
		}
		for _, metric := range req.Metrics {
			updateLegacyMetric(current, metric, row[metric.Field])
		}
	}

	out := make([]map[string]any, 0, len(order))
	for _, key := range order {
		row := grouped[key]
		for _, metric := range req.Metrics {
			alias := safeAlias(metric.Alias)
			if metric.Aggregation == "avg" {
				count := toFloat(row["__count_"+alias])
				if count > 0 {
					row[alias] = toFloat(row[alias]) / count
				}
			}
			delete(row, "__count_"+alias)
		}
		out = append(out, row)
	}
	sortLegacyRows(out, req.Sorts)
	limit := req.Limit
	if req.TopN > 0 && (limit == 0 || req.TopN < limit) {
		limit = req.TopN
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}

	columns := make([]DatasetQueryColumn, 0, len(req.Dimensions)+len(req.Metrics))
	for _, dimension := range req.Dimensions {
		field := fields[dimension]
		columns = append(columns, DatasetQueryColumn{Name: dimension, Label: labelOrName(field), Role: "dimension", Type: field.Type})
	}
	for _, metric := range req.Metrics {
		field := fields[metric.Field]
		columns = append(columns, DatasetQueryColumn{Name: safeAlias(metric.Alias), Label: labelOrName(field), Role: "measure", Type: "number"})
	}
	return DatasetQueryResponse{Columns: columns, Rows: out}, nil
}

func NormalizeReadOnlySQL(query string) (string, error) {
	query = strings.TrimSpace(query)
	query = strings.TrimSuffix(query, ";")
	if query == "" {
		return "", errors.New("dataset querySql is required")
	}
	lower := strings.ToLower(query)
	if !(strings.HasPrefix(lower, "select ") || strings.HasPrefix(lower, "with ")) {
		return "", errors.New("only SELECT/WITH dataset SQL is allowed")
	}
	if strings.Contains(query, ";") || strings.Contains(lower, "--") || strings.Contains(lower, "/*") {
		return "", errors.New("dataset SQL must be a single read-only statement")
	}
	if forbiddenSQLKeywordPattern.MatchString(query) {
		return "", errors.New("dataset SQL contains a forbidden keyword")
	}
	return query, nil
}

func buildSQLFilters(filters []QueryFilter, quote string) (string, []any) {
	var clauses []string
	var args []any
	for _, filter := range filters {
		field := quoteIdentifier(filter.Field, quote)
		operator := strings.ToLower(filter.Operator)
		switch operator {
		case "eq":
			clauses = append(clauses, field+" = ?")
			args = append(args, filter.Value)
		case "neq":
			clauses = append(clauses, field+" <> ?")
			args = append(args, filter.Value)
		case "gt":
			clauses = append(clauses, field+" > ?")
			args = append(args, filter.Value)
		case "gte":
			clauses = append(clauses, field+" >= ?")
			args = append(args, filter.Value)
		case "lt":
			clauses = append(clauses, field+" < ?")
			args = append(args, filter.Value)
		case "lte":
			clauses = append(clauses, field+" <= ?")
			args = append(args, filter.Value)
		case "contains":
			clauses = append(clauses, field+" LIKE ?")
			args = append(args, "%"+fmt.Sprint(filter.Value)+"%")
		case "in":
			values := filter.Values
			if len(values) == 0 {
				values = []any{filter.Value}
			}
			clauses = append(clauses, field+" IN ?")
			args = append(args, values)
		case "between":
			values := filter.Values
			if len(values) >= 2 {
				clauses = append(clauses, field+" BETWEEN ? AND ?")
				args = append(args, values[0], values[1])
			}
		}
	}
	return strings.Join(clauses, " AND "), args
}

func buildSQLOrder(req DatasetQueryRequest, quote string) string {
	if len(req.Sorts) == 0 && req.TopN > 0 && len(req.Metrics) > 0 {
		return quoteIdentifier(safeAlias(req.Metrics[0].Alias), quote) + " DESC"
	}
	parts := make([]string, 0, len(req.Sorts))
	for _, sortItem := range req.Sorts {
		order := "DESC"
		if strings.EqualFold(sortItem.Order, "asc") {
			order = "ASC"
		}
		parts = append(parts, quoteIdentifier(safeAlias(sortItem.Field), quote)+" "+order)
	}
	return strings.Join(parts, ", ")
}

func scanSQLRows(rows *sql.Rows) ([]map[string]any, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		row := map[string]any{}
		for i, column := range columns {
			value := values[i]
			if bytes, ok := value.([]byte); ok {
				row[column] = string(bytes)
			} else {
				row[column] = value
			}
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func loadDatasetQueryCache(db *gorm.DB, datasetID uint, cacheKey string) (DatasetQueryResponse, bool) {
	var cache models.DatasetQueryCache
	err := db.Where("dataset_id = ? AND cache_key = ? AND expires_at > ?", datasetID, cacheKey, time.Now()).First(&cache).Error
	if err != nil {
		return DatasetQueryResponse{}, false
	}
	var response DatasetQueryResponse
	if err := json.Unmarshal(cache.Result, &response); err != nil {
		return DatasetQueryResponse{}, false
	}
	response.ExpiresAt = &cache.ExpiresAt
	return response, true
}

func saveDatasetQueryCache(db *gorm.DB, datasetID uint, cacheKey string, response DatasetQueryResponse, expiresAt time.Time) error {
	payload, err := json.Marshal(response)
	if err != nil {
		return err
	}
	cache := models.DatasetQueryCache{
		DatasetID: datasetID,
		CacheKey:  cacheKey,
		Result:    datatypes.JSON(payload),
		ExpiresAt: expiresAt,
	}
	return db.Where(models.DatasetQueryCache{DatasetID: datasetID, CacheKey: cacheKey}).Assign(cache).FirstOrCreate(&cache).Error
}

func datasetQueryCacheKey(datasetID uint, req DatasetQueryRequest) (string, error) {
	payload, err := json.Marshal(req)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(append([]byte(strconv.FormatUint(uint64(datasetID), 10)+":"), payload...))
	return hex.EncodeToString(hash[:]), nil
}

func quoteIdentifier(name string, quote string) string {
	escaped := strings.ReplaceAll(name, quote, quote+quote)
	return quote + escaped + quote
}

func safeAlias(alias string) string {
	alias = strings.TrimSpace(alias)
	if alias == "" {
		return "value"
	}
	return alias
}

func validAggregation(aggregation string) bool {
	switch aggregation {
	case "sum", "avg", "count", "min", "max":
		return true
	default:
		return false
	}
}

func validFilterOperator(operator string) bool {
	switch strings.ToLower(operator) {
	case "eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "between":
		return true
	default:
		return false
	}
}

func metricAliasExists(metrics []QueryMetric, alias string) bool {
	for _, metric := range metrics {
		if safeAlias(metric.Alias) == alias || metric.Field == alias {
			return true
		}
	}
	return false
}

func firstFieldsByRole(fields map[string]datasetFieldMeta, role string, count int) []string {
	names := make([]string, 0, len(fields))
	for name, field := range fields {
		if field.Role == role {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	if len(names) > count {
		return names[:count]
	}
	return names
}

func labelOrName(field datasetFieldMeta) string {
	if strings.TrimSpace(field.Label) != "" {
		return field.Label
	}
	return field.Name
}

func applyLegacyFilters(rows []map[string]any, filters []QueryFilter) []map[string]any {
	if len(filters) == 0 {
		return rows
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		matched := true
		for _, filter := range filters {
			if !legacyFilterMatches(row[filter.Field], filter) {
				matched = false
				break
			}
		}
		if matched {
			out = append(out, row)
		}
	}
	return out
}

func legacyFilterMatches(value any, filter QueryFilter) bool {
	switch strings.ToLower(filter.Operator) {
	case "eq":
		return reflect.DeepEqual(value, filter.Value) || fmt.Sprint(value) == fmt.Sprint(filter.Value)
	case "neq":
		return fmt.Sprint(value) != fmt.Sprint(filter.Value)
	case "contains":
		return strings.Contains(fmt.Sprint(value), fmt.Sprint(filter.Value))
	case "in":
		values := filter.Values
		if len(values) == 0 {
			values = []any{filter.Value}
		}
		for _, item := range values {
			if fmt.Sprint(value) == fmt.Sprint(item) {
				return true
			}
		}
		return false
	case "gt", "gte", "lt", "lte":
		left, right := toFloat(value), toFloat(filter.Value)
		switch strings.ToLower(filter.Operator) {
		case "gt":
			return left > right
		case "gte":
			return left >= right
		case "lt":
			return left < right
		case "lte":
			return left <= right
		}
	case "between":
		if len(filter.Values) < 2 {
			return true
		}
		left := toFloat(value)
		return left >= toFloat(filter.Values[0]) && left <= toFloat(filter.Values[1])
	}
	return true
}

func legacyInitialMetric(aggregation string) any {
	switch aggregation {
	case "min":
		return math.Inf(1)
	case "max":
		return math.Inf(-1)
	default:
		return float64(0)
	}
}

func updateLegacyMetric(row map[string]any, metric QueryMetric, value any) {
	alias := safeAlias(metric.Alias)
	number := toFloat(value)
	switch metric.Aggregation {
	case "count":
		row[alias] = toFloat(row[alias]) + 1
	case "sum", "avg":
		row[alias] = toFloat(row[alias]) + number
		row["__count_"+alias] = toFloat(row["__count_"+alias]) + 1
	case "min":
		if number < toFloat(row[alias]) {
			row[alias] = number
		}
	case "max":
		if number > toFloat(row[alias]) {
			row[alias] = number
		}
	}
}

func sortLegacyRows(rows []map[string]any, sorts []QuerySort) {
	if len(sorts) == 0 {
		return
	}
	sort.SliceStable(rows, func(i, j int) bool {
		for _, sortItem := range sorts {
			left := rows[i][sortItem.Field]
			right := rows[j][sortItem.Field]
			cmp := strings.Compare(fmt.Sprint(left), fmt.Sprint(right))
			if toFloat(left) != 0 || toFloat(right) != 0 {
				if toFloat(left) < toFloat(right) {
					cmp = -1
				} else if toFloat(left) > toFloat(right) {
					cmp = 1
				} else {
					cmp = 0
				}
			}
			if cmp == 0 {
				continue
			}
			if strings.EqualFold(sortItem.Order, "asc") {
				return cmp < 0
			}
			return cmp > 0
		}
		return false
	})
}

func toFloat(value any) float64 {
	switch typed := value.(type) {
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case float64:
		return typed
	case float32:
		return float64(typed)
	case json.Number:
		number, _ := typed.Float64()
		return number
	case string:
		number, _ := strconv.ParseFloat(typed, 64)
		return number
	default:
		return 0
	}
}
