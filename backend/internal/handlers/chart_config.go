package handlers

import (
	"encoding/json"
	"math"
	"strings"

	"gorm.io/datatypes"

	"lightbi/backend/internal/models"
	"lightbi/backend/internal/services"
)

const (
	maxChartWidgets       = 80
	maxChartFieldRefs     = 20
	maxChartFieldNameSize = 80
	maxChartTextSize      = 20000
)

func normalizeConfig(raw json.RawMessage) (datatypes.JSON, bool) {
	if len(raw) == 0 {
		return datatypes.JSON([]byte(`{"version":2,"widgets":[]}`)), true
	}

	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, false
	}
	if !validChartDocument(doc) {
		return nil, false
	}
	normalized, err := json.Marshal(doc)
	if err != nil {
		return nil, false
	}
	return datatypes.JSON(normalized), true
}

func validChartDocument(doc map[string]any) bool {
	version, ok := numberAsInt(doc["version"])
	if !ok {
		version = 1
	}
	if version != 1 && version != 2 {
		return false
	}
	doc["version"] = 2

	widgets, ok := doc["widgets"].([]any)
	if !ok || len(widgets) > maxChartWidgets {
		return false
	}
	for _, rawWidget := range widgets {
		widget, ok := rawWidget.(map[string]any)
		if !ok || !validChartWidget(widget) {
			return false
		}
	}
	return true
}

func validChartWidget(widget map[string]any) bool {
	id, ok := widget["id"].(string)
	if !ok || strings.TrimSpace(id) == "" || len(id) > 128 {
		return false
	}
	chartType, ok := widget["type"].(string)
	if !ok || !models.ValidChartType(models.ChartType(chartType)) {
		return false
	}
	for _, key := range []string{"x", "y", "width", "height"} {
		if !validFiniteNumber(widget[key]) {
			return false
		}
	}
	config, ok := widget["config"].(map[string]any)
	if !ok {
		return false
	}
	return normalizeChartWidgetConfig(config)
}

func normalizeChartWidgetConfig(config map[string]any) bool {
	delete(config, "previewRows")
	for _, key := range []string{"dimensions", "measures"} {
		fields, ok := stringList(config[key])
		if !ok || len(fields) > maxChartFieldRefs {
			return false
		}
		for _, field := range fields {
			if strings.TrimSpace(field) == "" || len(field) > maxChartFieldNameSize {
				return false
			}
		}
		config[key] = fields
	}
	if text, ok := config["textContent"].(string); ok {
		if len(text) > maxChartTextSize {
			return false
		}
		config["textContent"] = strings.TrimSpace(text)
	}
	if textHTML, ok := config["textHtml"].(string); ok {
		if len(textHTML) > maxChartTextSize {
			return false
		}
		config["textHtml"] = services.SanitizeHTML(textHTML)
	}
	return true
}

func stringList(value any) ([]string, bool) {
	if value == nil {
		return []string{}, true
	}
	values, ok := value.([]any)
	if !ok {
		return nil, false
	}
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, item := range values {
		text, ok := item.(string)
		if !ok {
			return nil, false
		}
		text = strings.TrimSpace(text)
		if text != "" && !seen[text] {
			seen[text] = true
			out = append(out, text)
		}
	}
	return out, true
}

func validFiniteNumber(value any) bool {
	number, ok := value.(float64)
	return ok && !math.IsNaN(number) && !math.IsInf(number, 0)
}

func numberAsInt(value any) (int, bool) {
	number, ok := value.(float64)
	if !ok || math.Trunc(number) != number {
		return 0, false
	}
	return int(number), true
}
