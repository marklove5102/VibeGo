package transport

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestHTTPSUpgradeHandlerServesUpgradePageForHTMLRequests(t *testing.T) {
	t.Parallel()

	handler, err := NewHTTPSUpgradeHandler(HTTPSUpgradeHandlerConfig{
		DistFS: fstest.MapFS{
			"http-upgrade.html": {Data: []byte("<!doctype html><title>upgrade</title>")},
			"assets/app.js":     {Data: []byte("console.log('ok')")},
		},
	})
	if err != nil {
		t.Fatalf("NewHTTPSUpgradeHandler: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "http://example.com:1984/tools/keyboard?tab=voice", nil)
	req.Header.Set("Accept", "text/html")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusOK)
	}
	if cacheControl := res.Header.Get("Cache-Control"); cacheControl != "no-store" {
		t.Fatalf("Cache-Control = %q, want %q", cacheControl, "no-store")
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if !strings.Contains(string(body), "<title>upgrade</title>") {
		t.Fatalf("body does not contain upgrade page: %s", string(body))
	}
}

func TestHTTPSUpgradeHandlerServesStaticAssets(t *testing.T) {
	t.Parallel()

	handler, err := NewHTTPSUpgradeHandler(HTTPSUpgradeHandlerConfig{
		DistFS: fstest.MapFS{
			"http-upgrade.html":   {Data: []byte("<!doctype html>")},
			"assets/upgrade.js":   {Data: []byte("console.log('asset')")},
			"icons/icon@32px.png": {Data: []byte("png")},
		},
	})
	if err != nil {
		t.Fatalf("NewHTTPSUpgradeHandler: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "http://example.com:1984/assets/upgrade.js", nil)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusOK)
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if string(body) != "console.log('asset')" {
		t.Fatalf("body = %q, want %q", string(body), "console.log('asset')")
	}
}

func TestHTTPSUpgradeHandlerRedirectsNonHTMLRequests(t *testing.T) {
	t.Parallel()

	handler, err := NewHTTPSUpgradeHandler(HTTPSUpgradeHandlerConfig{
		DistFS: fstest.MapFS{
			"http-upgrade.html": {Data: []byte("<!doctype html>")},
		},
	})
	if err != nil {
		t.Fatalf("NewHTTPSUpgradeHandler: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:1984/api/settings", nil)
	req.Header.Set("Accept", "application/json")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	res := rec.Result()
	defer res.Body.Close()

	if res.StatusCode != http.StatusTemporaryRedirect {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusTemporaryRedirect)
	}
	if location := res.Header.Get("Location"); location != "https://127.0.0.1:1984/api/settings" {
		t.Fatalf("location = %q, want %q", location, "https://127.0.0.1:1984/api/settings")
	}
}
