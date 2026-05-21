package services

import (
	"bytes"
	"html"
	"regexp"
	"strings"

	xhtml "golang.org/x/net/html"
)

var safeColorPattern = regexp.MustCompile(`(?i)^#?[0-9a-f]{3,8}$|^(rgb|rgba)\([\d\s,%.]+\)$|^[a-z]+$`)

func SanitizeHTML(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}
	tokenizer := xhtml.NewTokenizer(strings.NewReader(input))
	var out bytes.Buffer

	for {
		tokenType := tokenizer.Next()
		switch tokenType {
		case xhtml.ErrorToken:
			return out.String()
		case xhtml.TextToken:
			out.WriteString(html.EscapeString(string(tokenizer.Text())))
		case xhtml.StartTagToken, xhtml.SelfClosingTagToken:
			token := tokenizer.Token()
			tag := strings.ToLower(token.Data)
			if !allowedHTMLTag(tag) {
				continue
			}
			out.WriteByte('<')
			out.WriteString(tag)
			for _, attr := range safeHTMLAttrs(tag, token.Attr) {
				out.WriteByte(' ')
				out.WriteString(attr.Key)
				out.WriteString(`="`)
				out.WriteString(html.EscapeString(attr.Val))
				out.WriteByte('"')
			}
			if tokenType == xhtml.SelfClosingTagToken || tag == "br" {
				out.WriteString(" />")
			} else {
				out.WriteByte('>')
			}
		case xhtml.EndTagToken:
			tag := strings.ToLower(tokenizer.Token().Data)
			if allowedHTMLTag(tag) && tag != "br" {
				out.WriteString("</")
				out.WriteString(tag)
				out.WriteByte('>')
			}
		}
	}
}

func allowedHTMLTag(tag string) bool {
	switch tag {
	case "b", "strong", "i", "em", "u", "span", "font", "br", "p", "div", "ul", "ol", "li", "a":
		return true
	default:
		return false
	}
}

func safeHTMLAttrs(tag string, attrs []xhtml.Attribute) []xhtml.Attribute {
	out := make([]xhtml.Attribute, 0, len(attrs))
	for _, attr := range attrs {
		key := strings.ToLower(attr.Key)
		value := strings.TrimSpace(attr.Val)
		if value == "" {
			continue
		}
		if tag == "a" && key == "href" && safeHref(value) {
			out = append(out, xhtml.Attribute{Key: "href", Val: value})
			continue
		}
		if tag == "a" && key == "target" && (value == "_blank" || value == "_self") {
			out = append(out, xhtml.Attribute{Key: "target", Val: value})
			continue
		}
		if tag == "font" && key == "color" && safeColorPattern.MatchString(value) {
			out = append(out, xhtml.Attribute{Key: "color", Val: value})
			continue
		}
		if key == "style" {
			if color := safeColorStyle(value); color != "" {
				out = append(out, xhtml.Attribute{Key: "style", Val: color})
			}
		}
	}
	return out
}

func safeHref(value string) bool {
	lower := strings.ToLower(value)
	return strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "mailto:")
}

func safeColorStyle(value string) string {
	parts := strings.Split(value, ";")
	for _, part := range parts {
		keyValue := strings.SplitN(part, ":", 2)
		if len(keyValue) != 2 {
			continue
		}
		key := strings.TrimSpace(strings.ToLower(keyValue[0]))
		val := strings.TrimSpace(keyValue[1])
		if key == "color" && safeColorPattern.MatchString(val) {
			return "color: " + val
		}
	}
	return ""
}
