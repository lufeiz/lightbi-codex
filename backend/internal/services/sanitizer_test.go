package services

import (
	"strings"
	"testing"
)

func TestSanitizeHTMLKeepsWhitelistAndDropsScriptAttrs(t *testing.T) {
	got := SanitizeHTML(`<p style="color:#1677ff;position:absolute">Hi <strong>BI</strong><script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">bad</a></p>`)
	if !strings.Contains(got, "<strong>BI</strong>") {
		t.Fatalf("expected strong tag to survive, got %s", got)
	}
	if strings.Contains(got, "script") || strings.Contains(got, "javascript:") || strings.Contains(got, "onclick") || strings.Contains(got, "position") {
		t.Fatalf("expected unsafe HTML to be removed, got %s", got)
	}
}
