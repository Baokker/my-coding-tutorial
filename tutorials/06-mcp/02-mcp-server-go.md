# 02 - 用 Go 实现一个 MCP Server

## 目标

```
我们要实现一个 "笔记管理" MCP Server:

  ┌──────────────────────────────────────────────────┐
  │  notes-server (stdio MCP Server)                 │
  │                                                  │
  │  Tools:                                          │
  │  ├── create_note(title, content) → 创建笔记      │
  │  ├── list_notes()                → 列出所有笔记   │
  │  └── search_notes(query)         → 搜索笔记      │
  │                                                  │
  │  Resources:                                      │
  │  └── note://{id}                 → 获取笔记内容   │
  │                                                  │
  │  通信: stdio (JSON-RPC 2.0)                      │
  │  可以被 Claude Desktop / Claude Code 调用         │
  └──────────────────────────────────────────────────┘
```

---

## 完整代码

```go
package main

import (
    "bufio"
    "encoding/json"
    "fmt"
    "os"
    "strings"
    "time"
)

// ==================== JSON-RPC 数据结构 ====================

type JSONRPCRequest struct {
    JSONRPC string          `json:"jsonrpc"`
    Method  string          `json:"method"`
    Params  json.RawMessage `json:"params,omitempty"`
    ID      any             `json:"id,omitempty"`
}

type JSONRPCResponse struct {
    JSONRPC string `json:"jsonrpc"`
    Result  any    `json:"result,omitempty"`
    Error   *Error `json:"error,omitempty"`
    ID      any    `json:"id"`
}

type Error struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
}

// ==================== MCP 协议结构 ====================

type ServerInfo struct {
    Name    string `json:"name"`
    Version string `json:"version"`
}

type Capabilities struct {
    Tools     *struct{} `json:"tools,omitempty"`
    Resources *struct{} `json:"resources,omitempty"`
}

type InitializeResult struct {
    ProtocolVersion string       `json:"protocolVersion"`
    ServerInfo      ServerInfo   `json:"serverInfo"`
    Capabilities    Capabilities `json:"capabilities"`
}

type ToolDef struct {
    Name        string          `json:"name"`
    Description string          `json:"description"`
    InputSchema json.RawMessage `json:"inputSchema"`
}

type ToolCallParams struct {
    Name      string         `json:"name"`
    Arguments map[string]any `json:"arguments"`
}

type ContentItem struct {
    Type string `json:"type"`
    Text string `json:"text"`
}

type ToolResult struct {
    Content []ContentItem `json:"content"`
}

type ResourceDef struct {
    URI         string `json:"uri"`
    Name        string `json:"name"`
    Description string `json:"description"`
    MimeType    string `json:"mimeType"`
}

// ==================== 笔记数据 ====================

type Note struct {
    ID        string `json:"id"`
    Title     string `json:"title"`
    Content   string `json:"content"`
    CreatedAt string `json:"created_at"`
}

var notes = map[string]*Note{}
var noteCounter = 0

// ==================== MCP Server ====================

type MCPServer struct {
    scanner *bufio.Scanner
}

func NewMCPServer() *MCPServer {
    return &MCPServer{
        scanner: bufio.NewScanner(os.Stdin),
    }
}

// 发送 JSON-RPC 响应
func (s *MCPServer) sendResponse(id any, result any) {
    resp := JSONRPCResponse{
        JSONRPC: "2.0",
        Result:  result,
        ID:      id,
    }
    data, _ := json.Marshal(resp)
    fmt.Println(string(data))
}

func (s *MCPServer) sendError(id any, code int, message string) {
    resp := JSONRPCResponse{
        JSONRPC: "2.0",
        Error:   &Error{Code: code, Message: message},
        ID:      id,
    }
    data, _ := json.Marshal(resp)
    fmt.Println(string(data))
}

// 处理请求
func (s *MCPServer) handleRequest(req JSONRPCRequest) {
    switch req.Method {

    case "initialize":
        s.sendResponse(req.ID, InitializeResult{
            ProtocolVersion: "2024-11-05",
            ServerInfo:      ServerInfo{Name: "notes-server", Version: "1.0.0"},
            Capabilities: Capabilities{
                Tools:     &struct{}{},
                Resources: &struct{}{},
            },
        })

    case "notifications/initialized":
        // 通知类消息，不需要回复

    case "tools/list":
        s.sendResponse(req.ID, map[string]any{
            "tools": []ToolDef{
                {
                    Name:        "create_note",
                    Description: "创建一条新笔记",
                    InputSchema: json.RawMessage(`{
                        "type": "object",
                        "properties": {
                            "title": {"type": "string", "description": "笔记标题"},
                            "content": {"type": "string", "description": "笔记内容"}
                        },
                        "required": ["title", "content"]
                    }`),
                },
                {
                    Name:        "list_notes",
                    Description: "列出所有笔记的标题和ID",
                    InputSchema: json.RawMessage(`{"type": "object", "properties": {}}`),
                },
                {
                    Name:        "search_notes",
                    Description: "按关键词搜索笔记",
                    InputSchema: json.RawMessage(`{
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "搜索关键词"}
                        },
                        "required": ["query"]
                    }`),
                },
            },
        })

    case "tools/call":
        var params ToolCallParams
        json.Unmarshal(req.Params, &params)
        result := s.executeTool(params)
        s.sendResponse(req.ID, result)

    case "resources/list":
        var resources []ResourceDef
        for id, note := range notes {
            resources = append(resources, ResourceDef{
                URI:         "note://" + id,
                Name:        note.Title,
                Description: "笔记: " + note.Title,
                MimeType:    "text/plain",
            })
        }
        s.sendResponse(req.ID, map[string]any{"resources": resources})

    case "resources/read":
        var params struct{ URI string `json:"uri"` }
        json.Unmarshal(req.Params, &params)
        noteID := strings.TrimPrefix(params.URI, "note://")
        if note, ok := notes[noteID]; ok {
            s.sendResponse(req.ID, map[string]any{
                "contents": []map[string]string{{
                    "uri":      params.URI,
                    "mimeType": "text/plain",
                    "text":     fmt.Sprintf("# %s\n\n%s", note.Title, note.Content),
                }},
            })
        } else {
            s.sendError(req.ID, -1, "笔记不存在: "+noteID)
        }

    default:
        s.sendError(req.ID, -32601, "未知方法: "+req.Method)
    }
}

// 执行工具
func (s *MCPServer) executeTool(params ToolCallParams) ToolResult {
    switch params.Name {

    case "create_note":
        noteCounter++
        id := fmt.Sprintf("note-%d", noteCounter)
        title, _ := params.Arguments["title"].(string)
        content, _ := params.Arguments["content"].(string)

        notes[id] = &Note{
            ID:        id,
            Title:     title,
            Content:   content,
            CreatedAt: time.Now().Format("2006-01-02 15:04:05"),
        }

        return ToolResult{Content: []ContentItem{{
            Type: "text",
            Text: fmt.Sprintf("笔记创建成功! ID: %s, 标题: %s", id, title),
        }}}

    case "list_notes":
        if len(notes) == 0 {
            return ToolResult{Content: []ContentItem{{
                Type: "text", Text: "暂无笔记",
            }}}
        }
        var lines []string
        for id, note := range notes {
            lines = append(lines, fmt.Sprintf("- [%s] %s (%s)", id, note.Title, note.CreatedAt))
        }
        return ToolResult{Content: []ContentItem{{
            Type: "text", Text: strings.Join(lines, "\n"),
        }}}

    case "search_notes":
        query, _ := params.Arguments["query"].(string)
        query = strings.ToLower(query)
        var results []string
        for id, note := range notes {
            if strings.Contains(strings.ToLower(note.Title), query) ||
                strings.Contains(strings.ToLower(note.Content), query) {
                results = append(results, fmt.Sprintf("- [%s] %s", id, note.Title))
            }
        }
        if len(results) == 0 {
            return ToolResult{Content: []ContentItem{{
                Type: "text", Text: "未找到匹配的笔记",
            }}}
        }
        return ToolResult{Content: []ContentItem{{
            Type: "text", Text: fmt.Sprintf("找到 %d 条结果:\n%s", len(results), strings.Join(results, "\n")),
        }}}

    default:
        return ToolResult{Content: []ContentItem{{
            Type: "text", Text: "未知工具: " + params.Name,
        }}}
    }
}

// 主循环
func (s *MCPServer) Run() {
    s.scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

    for s.scanner.Scan() {
        line := s.scanner.Text()
        if line == "" {
            continue
        }

        var req JSONRPCRequest
        if err := json.Unmarshal([]byte(line), &req); err != nil {
            continue
        }

        s.handleRequest(req)
    }
}

func main() {
    server := NewMCPServer()
    server.Run()
}
```

---

## 配置和使用

```
编译:
  go build -o notes-server main.go

在 Claude Desktop 中配置 (~/.claude/claude_desktop_config.json):
  {
    "mcpServers": {
      "notes": {
        "command": "/path/to/notes-server"
      }
    }
  }

在 Claude Code 中配置 (.claude/settings.json):
  {
    "mcpServers": {
      "notes": {
        "command": "/path/to/notes-server"
      }
    }
  }

配置后 Claude 就能使用 create_note / list_notes / search_notes 工具了!

  ┌──────────────────────────────────────────────────┐
  │  用户: "帮我记一条笔记：明天下午2点开会"           │
  │                                                  │
  │  Claude:                                         │
  │  [Thought] 用户要创建笔记                         │
  │  [Tool Call] create_note(                        │
  │    title="会议提醒",                              │
  │    content="明天下午2点开会"                       │
  │  )                                               │
  │  [Result] 笔记创建成功! ID: note-1                │
  │  [Answer] 已经帮你记下了！                         │
  └──────────────────────────────────────────────────┘
```

---

**模块六完成！**

**下一个模块：** [模块七：Claude Code 底层原理](../07-claude-code/)
