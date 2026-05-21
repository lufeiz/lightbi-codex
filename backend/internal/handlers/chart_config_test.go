package handlers

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNormalizeConfigSanitizesRichTextAndStripsPreviewRows(t *testing.T) {
	raw := json.RawMessage(`{
		"version": 1,
		"widgets": [{
			"id": "w1",
			"type": "richText",
			"x": 0,
			"y": 0,
			"width": 320,
			"height": 220,
			"config": {
				"title": "文本",
				"dimensions": [],
				"measures": [],
				"textHtml": "<b>ok</b><script>alert(1)</script><img src=x onerror=alert(1)>",
				"previewRows": [{"x": 1}]
			}
		}]
	}`)

	normalized, ok := normalizeConfig(raw)
	if !ok {
		t.Fatal("expected config to normalize")
	}
	text := string(normalized)
	if strings.Contains(text, "script") || strings.Contains(text, "onerror") || strings.Contains(text, "previewRows") {
		t.Fatalf("expected unsafe content and previewRows to be removed, got %s", text)
	}
	if !strings.Contains(text, `"version":2`) {
		t.Fatalf("expected config to be normalized to version 2, got %s", text)
	}
}

func TestNormalizeConfigRejectsUnknownWidgetType(t *testing.T) {
	_, ok := normalizeConfig(json.RawMessage(`{
		"version": 2,
		"widgets": [{
			"id": "w1",
			"type": "unknown",
			"x": 0,
			"y": 0,
			"width": 320,
			"height": 220,
			"config": {"dimensions": [], "measures": []}
		}]
	}`))
	if ok {
		t.Fatal("expected unknown widget type to be rejected")
	}
}

func TestNormalizeConfigRejectsTooManyFields(t *testing.T) {
	fields := make([]string, 0, maxChartFieldRefs+1)
	for i := 0; i <= maxChartFieldRefs; i++ {
		fields = append(fields, "field_"+string(rune('a'+i)))
	}
	payload, _ := json.Marshal(map[string]any{
		"version": 2,
		"widgets": []any{map[string]any{
			"id":     "w1",
			"type":   "line",
			"x":      0,
			"y":      0,
			"width":  320,
			"height": 220,
			"config": map[string]any{"dimensions": fields, "measures": []string{}},
		}},
	})
	if _, ok := normalizeConfig(payload); ok {
		t.Fatal("expected too many fields to be rejected")
	}
}
