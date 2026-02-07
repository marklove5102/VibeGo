package aisession

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

type codexProvider struct {
	uuidRe *regexp.Regexp
}

func newCodexProvider() provider {
	return &codexProvider{
		uuidRe: regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`),
	}
}

func (p *codexProvider) ID() string {
	return string(ProviderCodex)
}

func (p *codexProvider) DefaultRoots() []string {
	return []string{filepath.Join(defaultHomeDir(), ".codex", "sessions")}
}

func (p *codexProvider) Scan(root string) ([]SessionMeta, error) {
	paths, err := collectFiles(root, func(path string, entry os.DirEntry) bool {
			return filepath.Ext(path) == ".jsonl"
		})
	if err != nil {
		return nil, err
	}
	result := make([]SessionMeta, 0, len(paths))
	for _, path := range paths {
		result = append(result, scanPath(p.ID(), path, func() (SessionMeta, error) {
			return p.parseSession(path)
		}))
	}
	return result, nil
}

func (p *codexProvider) LoadMessages(sourcePath string) ([]SessionMessage, error) {
	messages := make([]SessionMessage, 0)
	err := readJSONLines(sourcePath, func(value map[string]any) bool {
		if asString(value["type"]) != "response_item" {
			return true
		}
		payload := asMap(value["payload"])
		if payload == nil || asString(payload["type"]) != "message" {
			return true
		}
		content := extractText(payload["content"])
		if content == "" {
			return true
		}
		message := SessionMessage{
			Role:    asString(payload["role"]),
			Content: content,
			Ts:      parseTimestampToMillis(value["timestamp"]),
		}
		if message.Role == "" {
			message.Role = "unknown"
		}
		messages = append(messages, message)
		return true
	})
	return messages, err
}

func (p *codexProvider) parseSession(path string) (SessionMeta, error) {
	head, tail, err := readHeadTailLines(path, 10, 30)
	if err != nil {
		return SessionMeta{}, err
	}

	var sessionID string
	var projectDir string
	var createdAt int64
	for _, line := range head {
		var value map[string]any
		if err := json.Unmarshal([]byte(line), &value); err != nil {
			continue
		}
		if createdAt == 0 {
			createdAt = parseTimestampToMillis(value["timestamp"])
		}
		if asString(value["type"]) != "session_meta" {
			continue
		}
		payload := asMap(value["payload"])
		if payload == nil {
			continue
		}
		if sessionID == "" {
			sessionID = asString(payload["id"])
		}
		if projectDir == "" {
			projectDir = asString(payload["cwd"])
		}
		if createdAt == 0 {
			createdAt = parseTimestampToMillis(payload["timestamp"])
		}
	}

	var lastActiveAt int64
	var summary string
	for index := len(tail) - 1; index >= 0; index-- {
		var value map[string]any
		if err := json.Unmarshal([]byte(tail[index]), &value); err != nil {
			continue
		}
		if lastActiveAt == 0 {
			lastActiveAt = parseTimestampToMillis(value["timestamp"])
		}
		if summary == "" && asString(value["type"]) == "response_item" {
			payload := asMap(value["payload"])
			if payload != nil && asString(payload["type"]) == "message" {
				text := extractText(payload["content"])
				if text != "" {
					summary = truncateSummary(text, 160)
				}
			}
		}
		if lastActiveAt != 0 && summary != "" {
			break
		}
	}

	if sessionID == "" {
		match := p.uuidRe.FindString(filepath.Base(path))
		sessionID = match
	}
	if sessionID == "" {
		return SessionMeta{}, fmt.Errorf("missing session id")
	}

	messageCount, _ := p.countMessages(path)
	return SessionMeta{
		SessionID:    sessionID,
		Title:        pathBasename(projectDir),
		Summary:      summary,
		ProjectDir:   projectDir,
		CreatedAt:    createdAt,
		LastActiveAt: lastActiveAt,
		SourcePath:   path,
		MessageCount: messageCount,
	}, nil
}

func (p *codexProvider) countMessages(path string) (int, error) {
	count := 0
	err := readJSONLines(path, func(value map[string]any) bool {
		if asString(value["type"]) != "response_item" {
			return true
		}
		payload := asMap(value["payload"])
		if payload == nil || asString(payload["type"]) != "message" {
			return true
		}
		if extractText(payload["content"]) == "" {
			return true
		}
		count++
		return true
	})
	return count, err
}
