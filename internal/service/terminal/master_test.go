package terminal

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestWSMaster_ReadWrite(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("failed to upgrade: %v", err)
			return
		}
		defer conn.Close()

		master := newWSMaster(conn, 5*time.Second)

		n, err := master.Write([]byte("hello"))
		if err != nil {
			t.Errorf("Write failed: %v", err)
			return
		}
		if n != 5 {
			t.Errorf("expected to write 5 bytes, wrote %d", n)
		}

		data, err := master.ReadMessage()
		if err != nil {
			t.Errorf("Read failed: %v", err)
			return
		}
		if string(data) != "world" {
			t.Errorf("expected 'world', got %s", string(data))
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial: %v", err)
	}
	defer conn.Close()

	_, msg, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("failed to read: %v", err)
	}
	if string(msg) != "hello" {
		t.Errorf("expected 'hello', got %s", string(msg))
	}

	err = conn.WriteMessage(websocket.BinaryMessage, []byte("world"))
	if err != nil {
		t.Fatalf("failed to write: %v", err)
	}
}

func TestWSMaster_ConcurrentWrite(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		master := newWSMaster(conn, 5*time.Second)

		done := make(chan bool, 10)
		for i := 0; i < 10; i++ {
			go func(id int) {
				master.Write([]byte("test"))
				done <- true
			}(i)
		}

		for i := 0; i < 10; i++ {
			<-done
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial: %v", err)
	}
	defer conn.Close()

	count := 0
	for i := 0; i < 10; i++ {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			t.Errorf("failed to read message %d: %v", i, err)
			break
		}
		if string(msg) == "test" {
			count++
		}
	}

	if count != 10 {
		t.Errorf("expected 10 messages, got %d", count)
	}
}
