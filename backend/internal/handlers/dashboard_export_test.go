package handlers

import "testing"

func TestSanitizeCSVCellEscapesFormulaPrefixes(t *testing.T) {
	cases := map[string]string{
		"=cmd()": "'=cmd()",
		"+1+2":   "'+1+2",
		"-10":    "'-10",
		"@SUM":   "'@SUM",
		"safe":   "safe",
		"":       "",
	}

	for input, want := range cases {
		if got := sanitizeCSVCell(input); got != want {
			t.Fatalf("sanitizeCSVCell(%q) = %q, want %q", input, got, want)
		}
	}
}
