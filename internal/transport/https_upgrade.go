package transport

import (
	"io/fs"
	"net/http"
	"net/url"
	"path"
	"strings"
)

type HTTPSUpgradeHandlerConfig struct {
	DistFS          fs.FS
	UpgradePagePath string
}

type httpsUpgradeHandler struct {
	distFS          fs.FS
	fileServer      http.Handler
	upgradePagePath string
}

func NewHTTPSUpgradeHandler(cfg HTTPSUpgradeHandlerConfig) (http.Handler, error) {
	upgradePagePath := strings.TrimPrefix(strings.TrimSpace(cfg.UpgradePagePath), "/")
	if upgradePagePath == "" {
		upgradePagePath = "http-upgrade.html"
	}

	if _, err := fs.Stat(cfg.DistFS, upgradePagePath); err != nil {
		return nil, err
	}

	return &httpsUpgradeHandler{
		distFS:          cfg.DistFS,
		fileServer:      http.FileServer(http.FS(cfg.DistFS)),
		upgradePagePath: upgradePagePath,
	}, nil
}

func (h *httpsUpgradeHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if shouldServeStaticFile(h.distFS, r.URL.Path) {
		h.fileServer.ServeHTTP(w, r)
		return
	}

	target := buildHTTPSRedirectURL(r)
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Redirect(w, r, target, http.StatusTemporaryRedirect)
		return
	}
	if !wantsHTML(r) {
		http.Redirect(w, r, target, http.StatusTemporaryRedirect)
		return
	}

	req := cloneRequestWithPath(r, "/"+h.upgradePagePath)
	w.Header().Set("Cache-Control", "no-store")
	h.fileServer.ServeHTTP(w, req)
}

func shouldServeStaticFile(distFS fs.FS, requestPath string) bool {
	cleanPath := path.Clean("/" + requestPath)
	if cleanPath == "/" {
		return false
	}

	filePath := strings.TrimPrefix(cleanPath, "/")
	info, err := fs.Stat(distFS, filePath)
	if err != nil {
		return false
	}

	return !info.IsDir()
}

func cloneRequestWithPath(r *http.Request, requestPath string) *http.Request {
	req := r.Clone(r.Context())
	clonedURL := *r.URL
	clonedURL.Path = requestPath
	clonedURL.RawPath = ""
	req.URL = &clonedURL
	req.RequestURI = req.URL.RequestURI()
	return req
}

func buildHTTPSRedirectURL(r *http.Request) string {
	target := &url.URL{
		Scheme:   "https",
		Host:     r.Host,
		Path:     r.URL.Path,
		RawPath:  r.URL.RawPath,
		RawQuery: r.URL.RawQuery,
	}
	return target.String()
}

func wantsHTML(r *http.Request) bool {
	accept := strings.ToLower(r.Header.Get("Accept"))
	return accept == "" || strings.Contains(accept, "text/html")
}
