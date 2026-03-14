.PHONY: generate-docs clean-code format dev-server dev-ui build build-frontend build-backend package-backend build-release prepare-test test download-sherpa

SHERPA_VERSION ?= 1.12.36
SHERPA_ARCHIVE ?= sherpa-onnx-wasm-simd-$(SHERPA_VERSION)-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small.tar.bz2
SHERPA_URL ?= https://github.com/k2-fsa/sherpa-onnx/releases/download/v$(SHERPA_VERSION)/$(SHERPA_ARCHIVE)
SHERPA_DIR ?= $(UI_DIR)/public/sherpa

VERSION ?= $(shell git describe --tags --match 'v*' 2>/dev/null || echo v0.0.0-dev)
DIST_DIR ?= dist
ARTIFACTS_DIR ?= artifacts
BINARY_NAME ?= vibego
UI_DIR ?= ui
RELEASE_TARGETS ?= android/arm64 linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64

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

download-sherpa:
	@if [ -f "$(SHERPA_DIR)/sherpa-onnx-wasm-main-vad-asr.wasm" ]; then \
		echo "Sherpa WASM files already exist, skipping download"; \
	else \
		echo "Downloading sherpa-onnx WASM VAD+ASR (SenseVoice)..."; \
		mkdir -p $(SHERPA_DIR); \
		curl -L "$(SHERPA_URL)" -o /tmp/$(SHERPA_ARCHIVE); \
		tar xf /tmp/$(SHERPA_ARCHIVE) -C /tmp; \
		cp /tmp/sherpa-onnx-wasm-simd-$(SHERPA_VERSION)-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small/*.js $(SHERPA_DIR)/; \
		cp /tmp/sherpa-onnx-wasm-simd-$(SHERPA_VERSION)-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small/*.wasm $(SHERPA_DIR)/; \
		cp /tmp/sherpa-onnx-wasm-simd-$(SHERPA_VERSION)-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small/*.data $(SHERPA_DIR)/; \
		rm -rf /tmp/$(SHERPA_ARCHIVE) /tmp/sherpa-onnx-wasm-simd-$(SHERPA_VERSION)-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small; \
		echo "Sherpa WASM files downloaded to $(SHERPA_DIR)"; \
	fi

build-frontend: download-sherpa
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

TEST_REPO_DIR ?= testdata/repo

prepare-test:
	@echo "Creating test git repository at $(TEST_REPO_DIR)..."
	@rm -rf $(TEST_REPO_DIR)
	@mkdir -p $(TEST_REPO_DIR)
	@cd $(TEST_REPO_DIR) && git init
	@cd $(TEST_REPO_DIR) && git config user.name "Test User"
	@cd $(TEST_REPO_DIR) && git config user.email "test@vibego.local"
	@cd $(TEST_REPO_DIR) && echo "# Test Repo" > README.md && git add README.md && git commit -m "initial commit"
	@cd $(TEST_REPO_DIR) && echo "package main" > main.go && git add main.go && git commit -m "add main.go"
	@cd $(TEST_REPO_DIR) && echo "hello" > hello.txt && git add hello.txt && git commit -m "add hello.txt"
	@cd $(TEST_REPO_DIR) && git checkout -b feature-a
	@cd $(TEST_REPO_DIR) && echo "feature a" > feature.txt && git add feature.txt && git commit -m "feature a work"
	@cd $(TEST_REPO_DIR) && git checkout main
	@cd $(TEST_REPO_DIR) && git checkout -b feature-b
	@cd $(TEST_REPO_DIR) && echo "feature b" > other.txt && git add other.txt && git commit -m "feature b work"
	@cd $(TEST_REPO_DIR) && git checkout main
	@cd $(TEST_REPO_DIR) && echo "modified" >> hello.txt
	@echo "Test repo ready at $(TEST_REPO_DIR)"
	@echo "  Branches: main, feature-a, feature-b"
	@echo "  Uncommitted change: hello.txt"

test:
	go test -v -count=1 ./internal/handler/ -run TestGit -timeout 120s
