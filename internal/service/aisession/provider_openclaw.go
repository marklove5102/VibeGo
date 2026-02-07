package aisession

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type openClawProvider struct{}

func newOpenClawProvider() provider {
	return &openClawProvider{}
}

func (p *openClawProvider) ID() string {
	return string(ProviderOpenClaw)
}

func (p *openClawProvider) DefaultRoots() []string {
	return []string{filepath.Join(defaultHomeDir(), ".openclaw", "agents")}
}

func (p *openClawProvider) Scan(root string) ([]SessionMeta, error) {
	agentEntries, err := os.ReadDir(root)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	result := make([]SessionMeta, 0)
	for _, entry := range agentEntries {
		if !entry.IsDir() {
			continue
		}
		sessionsDir := filepath.Join(root, entry.Name(), "sessions")
		paths, _ := collectFiles(sessionsDir, func(path string, entry os.DirEntry) bool {
			return filepath.Ext(path) == ".jsonl" && entry.Name() != "sessions.json"
		})
		for _, path := range paths {
			result = append(result, scanPath(p.ID(), path, func() (SessionMeta, error) {
				return p.parseSession(path)
			}))
		}
	}
	return result, nil
}

func (p *openClawProvider) LoadMessages(sourcePath string) ([]SessionMessage, error) {
	messages := make([]SessionMessage, 0)
	err := readJSONLines(sourcePath, func(value map[string]any) bool {
		if asString(value["type"]) != "message" {
			return true
		}
		messageValue := asMap(value["message"])
		if messageValue == nil {
			return true
		}
		content := extractText(messageValue["content"])
		if content == "" {
			return true
		}
		role := asString(messageValue["role"])
		if role == "toolResult" {
			role = "tool"
		}
		if role == "" {
			role = "unknown"
		}
		messages = append(messages, SessionMessage{
			Role:    role,
			Content: content,
			Ts:      parseTimestampToMillis(value["timestamp"]),
		})
		return true
	})
	return messages, err
}

func (p *openClawProvider) parseSession(path string) (SessionMeta, error) {
	head, tail, err := readHeadTailLines(path, 10, 30)
	if err != nil {
		return SessionMeta{}, err
	}
	var sessionID string
	var projectDir string
	var createdAt int64
	var summary string
	for _, line := range head {
		var value map[string]any
		if err := json.Unmarshal([]byte(line), &value); err != nil {
			continue
		}
		if createdAt == 0 {
			createdAt = parseTimestampToMillis(value["timestamp"])
		}
		switch asString(value["type"]) {
		case "session":
			if sessionID == "" {
				sessionID = asString(value["id"])
			}
			if projectDir == "" {
				projectDir = asString(value["cwd"])
			}
		case "message":
			if summary == "" {
				text := extractText(asMap(value["message"])["content"])
				if text != "" {
					summary = truncateSummary(text, 160)
				}
			}
		}
	}
	var lastActiveAt int64
	for index := len(tail) - 1; index >= 0; index-- {
		var value map[string]any
		if err := json.Unmarshal([]byte(tail[index]), &value); err != nil {
			continue
		}
		lastActiveAt = parseTimestampToMillis(value["timestamp"])
		if lastActiveAt != 0 {
			break
		}
	}
	if sessionID == "" {
		sessionID = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
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

func (p *openClawProvider) countMessages(path string) (int, error) {
	count := 0
	err := readJSONLines(path, func(value map[string]any) bool {
		if asString(value["type"]) != "message" {
			return true
		}
		if extractText(asMap(value["message"])["content"]) == "" {
			return true
		}
		count++
		return true
	})
	return count, err
}
