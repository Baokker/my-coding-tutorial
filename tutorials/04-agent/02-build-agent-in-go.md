# 02 - 用 Go 从零实现一个 Agent

## 目标

```
我们要实现的 Agent 架构:

  ┌─────────────────────────────────────────────────────────┐
  │                   SimpleAgent                           │
  │                                                         │
  │  ┌──────────────────────────────────────────────────┐   │
  │  │                Agent Loop                        │   │
  │  │                                                  │   │
  │  │  User Input                                      │   │
  │  │      │                                           │   │
  │  │      ▼                                           │   │
  │  │  ┌────────────────┐                              │   │
  │  │  │ Build Messages │                              │   │
  │  │  │ System + Tools │                              │   │
  │  │  │ + History      │                              │   │
  │  │  └───────┬────────┘                              │   │
  │  │          │                                       │   │
  │  │          ▼                                       │   │
  │  │  ┌────────────────┐     ┌────────────────────┐  │   │
  │  │  │  LLM API Call  │────▶│ Tool Call?          │  │   │
  │  │  │  (Claude API)  │     │                    │  │   │
  │  │  └────────────────┘     │  Yes: Execute Tool │  │   │
  │  │          ▲              │       → Loop       │  │   │
  │  │          │              │                    │  │   │
  │  │          └──────────────│  No: Return Text   │  │   │
  │  │                         │       → Done       │  │   │
  │  │                         └────────────────────┘  │   │
  │  └──────────────────────────────────────────────────┘   │
  │                                                         │
  │  Tools:                                                 │
  │  ┌───────────┐ ┌─────────────┐ ┌───────────────────┐   │
  │  │ calculate │ │ get_time    │ │ read_file         │   │
  │  │ 计算表达式 │ │ 获取当前时间 │ │ 读取文件内容       │   │
  │  └───────────┘ └─────────────┘ └───────────────────┘   │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
```

---

## 完整代码

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "math"
    "net/http"
    "os"
    "strconv"
    "strings"
    "time"
)

// ==================== 数据结构 ====================

// Claude API 的消息格式
type Message struct {
    Role    string    `json:"role"`
    Content []Content `json:"content"`
}

type Content struct {
    Type      string `json:"type"`
    Text      string `json:"text,omitempty"`
    ID        string `json:"id,omitempty"`
    Name      string `json:"name,omitempty"`
    Input     any    `json:"input,omitempty"`
    ToolUseID string `json:"tool_use_id,omitempty"`
    Content   string `json:"content,omitempty"` // tool_result 的内容
}

type Tool struct {
    Name        string     `json:"name"`
    Description string     `json:"description"`
    InputSchema InputSchema `json:"input_schema"`
}

type InputSchema struct {
    Type       string              `json:"type"`
    Properties map[string]Property `json:"properties"`
    Required   []string            `json:"required"`
}

type Property struct {
    Type        string `json:"type"`
    Description string `json:"description"`
}

type APIRequest struct {
    Model     string    `json:"model"`
    MaxTokens int       `json:"max_tokens"`
    System    string    `json:"system"`
    Tools     []Tool    `json:"tools"`
    Messages  []Message `json:"messages"`
}

type APIResponse struct {
    Content  []Content `json:"content"`
    StopReason string  `json:"stop_reason"`
}

// ==================== 工具定义 ====================

// 定义 Agent 可以使用的工具
func getTools() []Tool {
    return []Tool{
        {
            Name:        "calculate",
            Description: "计算一个数学表达式，支持加减乘除和常见函数",
            InputSchema: InputSchema{
                Type: "object",
                Properties: map[string]Property{
                    "expression": {
                        Type:        "string",
                        Description: "要计算的数学表达式，如 '2+3*4' 或 'sqrt(16)'",
                    },
                },
                Required: []string{"expression"},
            },
        },
        {
            Name:        "get_current_time",
            Description: "获取当前的日期和时间",
            InputSchema: InputSchema{
                Type:       "object",
                Properties: map[string]Property{},
            },
        },
        {
            Name:        "read_file",
            Description: "读取指定路径的文件内容",
            InputSchema: InputSchema{
                Type: "object",
                Properties: map[string]Property{
                    "path": {
                        Type:        "string",
                        Description: "文件路径",
                    },
                },
                Required: []string{"path"},
            },
        },
    }
}

// ==================== 工具执行 ====================

// 根据工具名执行对应的函数
func executeTool(name string, input map[string]any) string {
    switch name {
    case "calculate":
        expr, _ := input["expression"].(string)
        return calculate(expr)
    case "get_current_time":
        return time.Now().Format("2006-01-02 15:04:05 (Monday)")
    case "read_file":
        path, _ := input["path"].(string)
        data, err := os.ReadFile(path)
        if err != nil {
            return fmt.Sprintf("Error: %v", err)
        }
        return string(data)
    default:
        return fmt.Sprintf("Unknown tool: %s", name)
    }
}

// 简单的计算器
func calculate(expr string) string {
    expr = strings.TrimSpace(expr)

    // 处理 sqrt
    if strings.HasPrefix(expr, "sqrt(") {
        numStr := expr[5 : len(expr)-1]
        num, err := strconv.ParseFloat(numStr, 64)
        if err != nil {
            return "Error: invalid number"
        }
        return fmt.Sprintf("%g", math.Sqrt(num))
    }

    // 简单四则运算（生产环境请用表达式解析库）
    for _, op := range []string{"+", "-", "*", "/"} {
        if idx := strings.LastIndex(expr, op); idx > 0 {
            left, err1 := strconv.ParseFloat(strings.TrimSpace(expr[:idx]), 64)
            right, err2 := strconv.ParseFloat(strings.TrimSpace(expr[idx+1:]), 64)
            if err1 != nil || err2 != nil {
                continue
            }
            switch op {
            case "+": return fmt.Sprintf("%g", left+right)
            case "-": return fmt.Sprintf("%g", left-right)
            case "*": return fmt.Sprintf("%g", left*right)
            case "/":
                if right == 0 { return "Error: division by zero" }
                return fmt.Sprintf("%g", left/right)
            }
        }
    }
    return "Error: cannot parse expression"
}

// ==================== Agent 核心 ====================

type Agent struct {
    apiKey   string
    model    string
    system   string
    tools    []Tool
    messages []Message
}

func NewAgent(apiKey string) *Agent {
    return &Agent{
        apiKey: apiKey,
        model:  "claude-sonnet-4-6-20250514",
        system: `你是一个有用的助手。你可以使用提供的工具来帮助用户。
当需要计算、查询时间或读取文件时，请使用对应的工具。
回答要简洁明了。`,
        tools:    getTools(),
        messages: []Message{},
    }
}

// 调用 Claude API
func (a *Agent) callLLM() (*APIResponse, error) {
    reqBody := APIRequest{
        Model:     a.model,
        MaxTokens: 1024,
        System:    a.system,
        Tools:     a.tools,
        Messages:  a.messages,
    }

    jsonData, _ := json.Marshal(reqBody)

    req, _ := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewBuffer(jsonData))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("x-api-key", a.apiKey)
    req.Header.Set("anthropic-version", "2023-06-01")

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("API call failed: %w", err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)

    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
    }

    var apiResp APIResponse
    if err := json.Unmarshal(body, &apiResp); err != nil {
        return nil, fmt.Errorf("parse response failed: %w", err)
    }
    return &apiResp, nil
}

// Agent 主循环 — 这是最核心的部分!
func (a *Agent) Run(userInput string) (string, error) {
    // 添加用户消息
    a.messages = append(a.messages, Message{
        Role: "user",
        Content: []Content{{Type: "text", Text: userInput}},
    })

    maxIterations := 10  // 防止无限循环

    for i := 0; i < maxIterations; i++ {
        fmt.Printf("\n--- Agent Loop 第 %d 轮 ---\n", i+1)

        // 调用 LLM
        resp, err := a.callLLM()
        if err != nil {
            return "", err
        }

        // 把 LLM 的响应加入历史
        a.messages = append(a.messages, Message{
            Role:    "assistant",
            Content: resp.Content,
        })

        // 检查是否有工具调用
        var toolResults []Content
        hasToolUse := false

        for _, content := range resp.Content {
            switch content.Type {
            case "text":
                fmt.Printf("[Thought] %s\n", content.Text)

            case "tool_use":
                hasToolUse = true
                inputMap, _ := content.Input.(map[string]any)
                fmt.Printf("[Action] %s(%v)\n", content.Name, inputMap)

                // 执行工具
                result := executeTool(content.Name, inputMap)
                fmt.Printf("[Observation] %s\n", result)

                toolResults = append(toolResults, Content{
                    Type:      "tool_result",
                    ToolUseID: content.ID,
                    Content:   result,
                })
            }
        }

        // 如果没有工具调用，说明 Agent 决定直接回答
        if !hasToolUse {
            for _, content := range resp.Content {
                if content.Type == "text" {
                    return content.Text, nil
                }
            }
        }

        // 有工具调用 → 把结果喂回给 LLM → 继续循环
        a.messages = append(a.messages, Message{
            Role:    "user",
            Content: toolResults,
        })
    }

    return "", fmt.Errorf("agent exceeded max iterations")
}

// ==================== 主函数 ====================

func main() {
    apiKey := os.Getenv("ANTHROPIC_API_KEY")
    if apiKey == "" {
        fmt.Println("请设置 ANTHROPIC_API_KEY 环境变量")
        fmt.Println("export ANTHROPIC_API_KEY=your-key-here")
        return
    }

    agent := NewAgent(apiKey)

    // 测试: 需要多步工具调用的任务
    query := "现在几点了？另外帮我算一下 1024 * 768 等于多少"

    fmt.Println("用户:", query)
    answer, err := agent.Run(query)
    if err != nil {
        fmt.Println("Error:", err)
        return
    }
    fmt.Println("\n最终回答:", answer)
}
```

---

## Agent Loop 执行过程可视化

```
用户: "现在几点了？另外帮我算一下 1024 * 768 等于多少"

  ┌─── Loop 第 1 轮 ──────────────────────────────────────┐
  │                                                       │
  │  → 发送给 LLM (带工具定义)                              │
  │                                                       │
  │  ← LLM 返回:                                          │
  │    [text] "让我查一下时间并计算。"                       │
  │    [tool_use] get_current_time()                      │
  │    [tool_use] calculate({expression: "1024*768"})     │
  │                                                       │
  │  → 执行工具:                                           │
  │    get_current_time() → "2026-04-22 14:30:00"         │
  │    calculate("1024*768") → "786432"                   │
  │                                                       │
  │  → 工具结果加入消息历史                                 │
  │                                                       │
  └───────────────────────────────────────────────────────┘

  ┌─── Loop 第 2 轮 ──────────────────────────────────────┐
  │                                                       │
  │  → 发送给 LLM (包含工具结果)                            │
  │                                                       │
  │  ← LLM 返回:                                          │
  │    [text] "现在是 14:30，1024×768=786432"              │
  │    (没有工具调用 → 循环结束!)                            │
  │                                                       │
  └───────────────────────────────────────────────────────┘

  消息历史演变:

  第1轮前: [system, user:"几点了..."]
                           │
  第1轮后: [system, user, assistant:[thought+tool_use], user:[tool_results]]
                           │
  第2轮后: [system, user, assistant, user, assistant:[final_answer]]
```

---

## 核心知识点

```
┌──────────────────────────────────────────────────────────┐
│  从这个实现中学到的 Agent 关键设计                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Agent Loop 是一个 while 循环                         │
│     → 不断调用 LLM 直到它不再请求工具                     │
│                                                          │
│  2. 工具定义 = JSON Schema                               │
│     → LLM 需要知道工具的名称、描述和参数格式              │
│                                                          │
│  3. LLM 不执行工具，只决定调什么                          │
│     → Agent 框架负责实际执行和结果回传                    │
│                                                          │
│  4. 消息历史 = Agent 的记忆                               │
│     → 每轮的推理和工具结果都追加到历史中                   │
│                                                          │
│  5. 需要防护措施                                          │
│     → 最大迭代次数（防止无限循环）                        │
│     → 工具执行的安全沙箱                                  │
│     → 上下文长度管理                                      │
│                                                          │
│  Claude Code 本质上就是这个模式的超级增强版:               │
│  → 更多工具 (Bash, Read, Edit, Write, Agent...)         │
│  → 更复杂的 System Prompt                               │
│  → 上下文压缩 (Compaction)                              │
│  → 权限控制                                              │
│  → 流式输出                                              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

**模块四完成！**

**下一个模块：** [模块五：RAG 全链路](../05-rag/)
