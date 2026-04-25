# 02 - OpenCode 架构分析

> GitHub: https://github.com/opencode-ai/opencode (12.1K stars, MIT)
> 语言: Go (99%)
> 后续项目: charmbracelet/crush (被 Charm 收购)
> Go 技术栈: Bubble Tea (TUI) + Cobra (CLI) + SQLite

## 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                       OpenCode 架构                              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                    TUI 层 (Bubble Tea)                    │    │
│  │                                                          │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │    │
│  │  │ Chat     │ │ Editor   │ │ Logs     │ │ Session  │   │    │
│  │  │ View     │ │ View     │ │ View     │ │ Selector │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │    │
│  │                                                          │    │
│  │  Vim-style 键绑定 | 多面板布局 | 实时流式输出              │    │
│  └──────────────────────────┬───────────────────────────────┘    │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐    │
│  │                    核心层 (internal/)                      │    │
│  │                                                          │    │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────────┐  │    │
│  │  │ Session    │  │ LLM        │  │ Tool              │  │    │
│  │  │ Manager    │  │ Provider   │  │ System            │  │    │
│  │  │            │  │            │  │                   │  │    │
│  │  │ 会话持久化  │  │ 多Provider  │  │ 内置工具集         │  │    │
│  │  │ SQLite    │  │ 抽象层     │  │ + MCP 扩展        │  │    │
│  │  └────────────┘  └────────────┘  └───────────────────┘  │    │
│  │                                                          │    │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────────┐  │    │
│  │  │ Config     │  │ LSP        │  │ Auto-compact      │  │    │
│  │  │ 配置管理    │  │ 语言服务    │  │ 上下文压缩         │  │    │
│  │  └────────────┘  └────────────┘  └───────────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                    Provider 层                            │    │
│  │                                                          │    │
│  │  ┌─────────┐ ┌────────┐ ┌────────┐ ┌──────────────────┐ │    │
│  │  │Anthropic│ │ OpenAI │ │ Gemini │ │ OpenAI-compatible│ │    │
│  │  │         │ │        │ │        │ │ (Ollama, etc)    │ │    │
│  │  └─────────┘ └────────┘ └────────┘ └──────────────────┘ │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 源码目录结构

```
opencode/
├── cmd/                        # CLI 入口 (Cobra)
│   └── root.go                 # 命令行参数解析
│
├── internal/                   # 核心业务逻辑
│   ├── config/                 # 配置管理 (JSON)
│   │   └── config.go
│   │
│   ├── session/                # 会话管理
│   │   ├── session.go          # Session CRUD
│   │   └── store.go            # SQLite 持久化
│   │
│   ├── llm/                    # LLM 核心
│   │   ├── provider/           # Provider 接口 + 实现
│   │   │   ├── provider.go     # Provider 接口定义 ← 关键!
│   │   │   ├── anthropic.go    # Claude 实现
│   │   │   ├── openai.go       # OpenAI 实现
│   │   │   └── google.go       # Gemini 实现
│   │   │
│   │   ├── tool/               # 工具系统
│   │   │   ├── tool.go         # Tool 接口定义 ← 关键!
│   │   │   ├── bash.go         # Bash 执行
│   │   │   ├── read.go         # 文件读取
│   │   │   ├── write.go        # 文件写入
│   │   │   ├── edit.go         # 文件编辑 (patch)
│   │   │   ├── grep.go         # 搜索
│   │   │   ├── glob.go         # 文件匹配
│   │   │   ├── fetch.go        # HTTP 请求
│   │   │   └── agent.go        # 子 Agent
│   │   │
│   │   ├── agent.go            # Agent Loop ← 核心!
│   │   └── compact.go          # 上下文压缩
│   │
│   ├── tui/                    # 终端 UI (Bubble Tea)
│   │   ├── app.go              # TUI 主程序
│   │   ├── chat.go             # 聊天界面
│   │   └── components/         # UI 组件
│   │
│   ├── lsp/                    # LSP 集成
│   │   └── client.go           # 语言服务客户端
│   │
│   └── db/                     # 数据库
│       └── db.go               # SQLite 操作
│
├── go.mod
└── main.go
```

---

## 核心模块分析

### 1. Provider 抽象（多 LLM 支持的关键）

```go
// 简化的 Provider 接口（基于 OpenCode 源码分析）

// Provider 接口 — 所有 LLM 都实现这个接口
type Provider interface {
    // 发送消息并获取响应（流式）
    SendMessage(ctx context.Context, params SendParams) <-chan StreamEvent

    // 获取模型信息
    Model() ModelInfo
}

type SendParams struct {
    SystemPrompt string
    Messages     []Message
    Tools        []ToolDef
    MaxTokens    int
}

type StreamEvent struct {
    Type      string    // "text", "tool_use", "done", "error"
    Text      string
    ToolCall  *ToolCall
    Error     error
}

// Anthropic Provider 实现
type AnthropicProvider struct {
    apiKey string
    model  string
}

func (p *AnthropicProvider) SendMessage(ctx context.Context, params SendParams) <-chan StreamEvent {
    ch := make(chan StreamEvent)
    go func() {
        defer close(ch)
        // 调用 Anthropic API，流式返回结果
        // 把 API 响应转换为统一的 StreamEvent
    }()
    return ch
}

// OpenAI Provider 实现
type OpenAIProvider struct { ... }
func (p *OpenAIProvider) SendMessage(...) <-chan StreamEvent { ... }
```

```
Provider 模式的优势:

  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │  Agent Loop 只依赖 Provider 接口                         │
  │  不关心底层是哪个 LLM                                    │
  │                                                          │
  │  ┌─────────────┐                                        │
  │  │ Agent Loop   │  provider.SendMessage(params)          │
  │  │             │─────────────┬──────────────────┐       │
  │  └─────────────┘             │                  │       │
  │                              ▼                  ▼       │
  │                    ┌──────────────┐   ┌──────────────┐  │
  │                    │  Anthropic   │   │   OpenAI     │  │
  │                    │  Provider    │   │  Provider    │  │
  │                    └──────┬───────┘   └──────┬───────┘  │
  │                           │                  │          │
  │                           ▼                  ▼          │
  │                    Claude API            OpenAI API     │
  │                                                          │
  │  添加新 Provider 只需实现接口，不改 Agent 代码              │
  │  这就是 Go 接口的 "鸭子类型" 优势                         │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

### 2. 工具系统

```go
// 简化的 Tool 接口

type Tool interface {
    Name() string
    Description() string
    InputSchema() map[string]any
    Execute(ctx context.Context, input map[string]any) (string, error)
}

// Bash 工具实现
type BashTool struct{}

func (t *BashTool) Name() string        { return "bash" }
func (t *BashTool) Description() string { return "执行 shell 命令" }
func (t *BashTool) InputSchema() map[string]any {
    return map[string]any{
        "type": "object",
        "properties": map[string]any{
            "command": map[string]string{
                "type": "string", "description": "要执行的命令",
            },
        },
    }
}
func (t *BashTool) Execute(ctx context.Context, input map[string]any) (string, error) {
    command := input["command"].(string)
    // 在受限环境中执行命令...
    return output, nil
}
```

```
工具注册和调度:

  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │  toolRegistry = map[string]Tool{                         │
  │    "bash":      &BashTool{},                             │
  │    "read_file": &ReadFileTool{},                         │
  │    "write":     &WriteTool{},                            │
  │    "edit":      &EditTool{},                             │
  │    "grep":      &GrepTool{},                             │
  │    "glob":      &GlobTool{},                             │
  │    "fetch":     &FetchTool{},                            │
  │    "agent":     &AgentTool{},                            │
  │    // MCP 工具在运行时动态注册                             │
  │  }                                                       │
  │                                                          │
  │  LLM 返回 tool_use →                                     │
  │    toolName := response.ToolCall.Name                    │
  │    tool := toolRegistry[toolName]                        │
  │    result := tool.Execute(ctx, input)                    │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

### 3. Agent Loop（核心循环）

```go
// 简化的 Agent Loop

func (a *Agent) Run(ctx context.Context, userMessage string) error {
    a.messages = append(a.messages, Message{
        Role: "user", Content: userMessage,
    })

    for {
        // 检查上下文长度，必要时压缩
        if a.tokenCount() > a.maxTokens*95/100 {
            a.compact()
        }

        // 流式调用 LLM
        events := a.provider.SendMessage(ctx, SendParams{
            SystemPrompt: a.systemPrompt,
            Messages:     a.messages,
            Tools:        a.getToolDefs(),
        })

        var assistantContent []Content
        var toolCalls []ToolCall

        // 处理流式事件
        for event := range events {
            switch event.Type {
            case "text":
                a.display(event.Text)  // 实时显示
                assistantContent = append(assistantContent, TextContent(event.Text))

            case "tool_use":
                toolCalls = append(toolCalls, *event.ToolCall)
                assistantContent = append(assistantContent, ToolUseContent(*event.ToolCall))
            }
        }

        a.messages = append(a.messages, Message{
            Role: "assistant", Content: assistantContent,
        })

        // 没有工具调用 → 回合结束
        if len(toolCalls) == 0 {
            return nil
        }

        // 执行工具
        var toolResults []Content
        for _, tc := range toolCalls {
            tool := a.tools[tc.Name]
            result, _ := tool.Execute(ctx, tc.Input)
            toolResults = append(toolResults, ToolResultContent(tc.ID, result))
        }

        a.messages = append(a.messages, Message{
            Role: "user", Content: toolResults,
        })
    }
}
```

### 4. Auto-compact（上下文压缩）

```
OpenCode 的自动压缩策略:

  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │  当上下文达到窗口的 95% 时自动触发压缩:                    │
  │                                                          │
  │  Token 使用  ▲                                           │
  │              │                                           │
  │              │                  ┌── 95% 触发 compact     │
  │              │      ████████████│                         │
  │              │  ████████████████│                         │
  │              │  ████████████████│                         │
  │              │──────────────────┤                         │
  │              │                  │                         │
  │              │           压缩后 │                         │
  │              │  ████            │                         │
  │              │  ████████████    │                         │
  │              │                  │                         │
  │              └──────────────────┴────────▶ 时间           │
  │                                                          │
  │  压缩过程:                                               │
  │  1. 把旧的对话历史发给 LLM                                │
  │  2. LLM 生成一个摘要                                     │
  │  3. 创建新 Session，摘要作为初始上下文                    │
  │  4. 保留最近的对话不压缩                                  │
  │                                                          │
  │  与 Claude Code 的 Compaction 类似                        │
  │  但实现更简单（直接新建 Session）                          │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

---

## OpenCode vs Claude Code 对比

```
┌──────────────────────────────────────────────────────────────┐
│              OpenCode vs Claude Code 架构对比                 │
├─────────────────┬──────────────────┬─────────────────────────┤
│                 │ OpenCode         │ Claude Code              │
├─────────────────┼──────────────────┼─────────────────────────┤
│ 语言            │ Go               │ TypeScript               │
│ LLM 支持        │ 多 Provider      │ 仅 Claude                │
│ UI              │ Bubble Tea TUI   │ Terminal + IDE 插件      │
│ 工具系统        │ Go 接口 + MCP    │ 内置 + MCP               │
│ 上下文管理      │ Auto-compact     │ Compaction               │
│ 持久化          │ SQLite           │ 文件系统                  │
│ 权限控制        │ 简单             │ 多层权限模型              │
│ 子 Agent        │ ✓                │ ✓                        │
│ 记忆系统        │ ✗                │ ✓ Memory 系统            │
│ 开源            │ ✓ (MIT)          │ ✗ (闭源)                 │
├─────────────────┴──────────────────┴─────────────────────────┤
│                                                              │
│  架构相似度: 80%                                              │
│  核心循环几乎一样: User → LLM → Tool Call → Execute → Loop   │
│                                                              │
│  主要差异:                                                    │
│  1. Claude Code 的 System Prompt 更精细（行为规范更丰富）     │
│  2. Claude Code 有完整的权限沙箱和记忆系统                    │
│  3. OpenCode 的 Provider 抽象更灵活（多 LLM）                 │
│  4. OpenCode 的 TUI 更炫酷（Bubble Tea）                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 如果你想自己写一个 AI 编程工具

```
从这两个项目中提炼的最小可行架构:

  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │  最小 AI 编程工具 = 5 个核心模块                          │
  │                                                          │
  │  ① Provider 接口                                        │
  │     → 抽象 LLM 调用，支持流式输出                        │
  │     → 先支持一个，接口设计好方便后续扩展                  │
  │                                                          │
  │  ② Tool 系统                                            │
  │     → 最少 4 个工具: Bash + Read + Edit + Write          │
  │     → Tool 接口统一: Name + Schema + Execute             │
  │                                                          │
  │  ③ Agent Loop                                           │
  │     → while(true): 调 LLM → 有 tool_call 就执行 → 循环  │
  │     → 核心就是模块四写的那个 Agent                        │
  │                                                          │
  │  ④ System Prompt                                        │
  │     → 定义工具使用规则和安全边界                          │
  │     → 参考 Claude Code 的设计                            │
  │                                                          │
  │  ⑤ 上下文管理                                           │
  │     → 对话太长时压缩历史                                 │
  │     → 可以简单地截断或让 LLM 总结                        │
  │                                                          │
  │  进阶模块（可后续添加）:                                  │
  │  ├── TUI 界面 (Bubble Tea)                              │
  │  ├── MCP 支持 (外部工具扩展)                              │
  │  ├── 权限控制                                            │
  │  ├── 记忆系统                                            │
  │  └── 子 Agent                                           │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

---

**模块八完成！全部 8 个模块的教程编写完毕！**
