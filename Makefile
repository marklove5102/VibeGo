.PHONY: generate-docs clean-code format dev-server dev-ui build build-frontend build-backend package-backend build-release

VERSION ?= v0.0.1-dev
DIST_DIR ?= dist
ARTIFACTS_DIR ?= artifacts
BINARY_NAME ?= vibego
UI_DIR ?= ui
RELEASE_TARGETS ?= linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64

generate-docs:
	@echo "Generating docs..."
	@GOOS= GOARCH= go run github.com/swaggo/swag/cmd/swag@latest init -g main.go -o ./internal/docs
	@echo "Docs generated successfully"

clean-code:
	find . -type f \( -name "*.go" -o -name "*.html" -o -name "*.md" \) -exec perl -CSDA -i -pe 's/\p{Extended_Pictographic} //g' {} +

format:
	gofmt -w .
	cd $(UI_DIR) && pnpm run check:fix

dev-server:
	air

dev-ui:
	cd ui && pnpm run dev --host

build:
	@mkdir -p $(DIST_DIR)
	@ext=""; \
	if [ "$$(go env GOOS)" = "windows" ]; then ext=".exe"; fi; \
	CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X github.com/xxnuo/vibego/internal/version.Version=$(VERSION)" -o "$(DIST_DIR)/$(BINARY_NAME)$${ext}" ./

build-frontend:
	cd $(UI_DIR) && pnpm install --frozen-lockfile
	cd $(UI_DIR) && pnpm run build

build-backend:
	@if [ -z "$(GOOS)" ] || [ -z "$(GOARCH)" ]; then \
		echo "GOOS and GOARCH are required"; \
		exit 1; \
	fi
	@mkdir -p $(DIST_DIR)
	@ext=""; \
	if [ "$(GOOS)" = "windows" ]; then ext=".exe"; fi; \
	output="$(BINARY_NAME)_$(VERSION)_$(GOOS)_$(GOARCH)$${ext}"; \
	CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) go build -trimpath -ldflags "-s -w -X github.com/xxnuo/vibego/internal/version.Version=$(VERSION)" -o "$(DIST_DIR)/$${output}" ./

package-backend:
	@if [ -z "$(GOOS)" ] || [ -z "$(GOARCH)" ]; then \
		echo "GOOS and GOARCH are required"; \
		exit 1; \
	fi
	@mkdir -p $(ARTIFACTS_DIR)
	@bin="$(BINARY_NAME)_$(VERSION)_$(GOOS)_$(GOARCH)"; \
	if [ "$(GOOS)" = "windows" ]; then bin="$${bin}.exe"; fi; \
	tar_name="$${bin%.exe}.tar.gz"; \
	tar -C $(DIST_DIR) -czf "$(ARTIFACTS_DIR)/$${tar_name}" "$${bin}"

build-release: build-frontend
	@for target in $(RELEASE_TARGETS); do \
		goos="$${target%/*}"; \
		goarch="$${target#*/}"; \
		$(MAKE) build-backend GOOS=$${goos} GOARCH=$${goarch} VERSION=$(VERSION); \
		$(MAKE) package-backend GOOS=$${goos} GOARCH=$${goarch} VERSION=$(VERSION); \
	done
