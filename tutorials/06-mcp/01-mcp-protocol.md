# 01 - MCP 协议详解

## MCP 架构

```
┌──────────────────────────────────────────────────────────────────┐
│                       MCP 三层架构                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Host（宿主应用）                                         │    │
│  │  Claude Desktop / Claude Code / IDE 插件 等               │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐  │    │
│  │  │  MCP Client (内置在 Host 中)                        │  │    │
│  │  │  负责与 MCP Server 建立连接、通信                     │  │    │
│  │  └───────┬───────────────┬───────────────┬────────────┘  │    │
│  │          │               │               │               │    │
│  └──────────┼───────────────┼───────────────┼───────────────┘    │
│             │  stdio/SSE    │  stdio/SSE    │  stdio/SSE         │
│             │               │               │                    │
│  ┌──────────▼────┐  ┌──────▼──────┐  ┌─────▼──────────┐        │
│  │ MCP Server A  │  │ MCP Server B│  │ MCP Server C   │        │
│  │ (文件系统)     │  │ (数据库)    │  │ (GitHub)       │        │
│  │               │  │             │  │                │        │
│  │ Tools:        │  │ Tools:      │  │ Tools:         │        │
│  │ - read_file   │  │ - query     │  │ - create_issue │        │
│  │ - write_file  │  │ - insert    │  │ - list_prs     │        │
│  │               │  │             │  │                │        │
│  │ Resources:    │  │ Resources:  │  │ Resources:     │        │
│  │ - file://     │  │ - db://     │  │ - gh://repo/   │        │
│  └───────────────┘  └─────────────┘  └────────────────┘        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 核心概念

```
MCP 定义了三种核心能力（Server 可以提供给 Client）:

  ┌────────────────────────────────────────────────────────────┐
  │                                                            │
  │  1. Tools（工具）— 让 LLM 执行操作                         │
  │  ┌──────────────────────────────────────────────────────┐  │
  │  │  类似 Agent 的 Tool Use                               │  │
  │  │  LLM 决定调用什么工具 → Client 转发给 Server 执行     │  │
  │  │                                                      │  │
  │  │  例: search_files, run_query, send_message            │  │
  │  └──────────────────────────────────────────────────────┘  │
  │                                                            │
  │  2. Resources（资源）— 给 LLM 提供上下文                    │
  │  ┌──────────────────────────────────────────────────────┐  │
  │  │  类似 RESTful 的 GET 操作                              │  │
  │  │  Client 主动请求资源内容                               │  │
  │  │                                                      │  │
  │  │  例: file://readme.md, db://users/123                │  │
  │  └──────────────────────────────────────────────────────┘  │
  │                                                            │
  │  3. Prompts（提示模板）— 预定义的交互模板                   │
  │  ┌──────────────────────────────────────────────────────┐  │
  │  │  Server 提供可复用的 Prompt 模板                       │  │
  │  │  用户可以选择模板并填入参数                             │  │
  │  │                                                      │  │
  │  │  例: "代码审查" 模板, "SQL 生成" 模板                  │  │
  │  └──────────────────────────────────────────────────────┘  │
  │                                                            │
  └────────────────────────────────────────────────────────────┘
```

---

## 通信流程

```
一次完整的 MCP Tool 调用流程:

  User        Host/Client        MCP Server       外部系统
   │              │                  │                │
   │ "查一下天气"  │                  │                │
   │─────────────▶│                  │                │
   │              │                  │                │
   │              │ ──LLM API调用──▶ │                │
   │              │   (带 tools 定义) │                │
   │              │                  │                │
   │              │ ◀─tool_use响应── │                │
   │              │  get_weather     │                │
   │              │  {city:"北京"}   │                │
   │              │                  │                │
   │              │ ─tools/call─────▶│                │
   │              │  get_weather     │ ───HTTP请求──▶ │
   │              │  {city:"北京"}   │                │ 天气API
   │              │                  │ ◀──响应─────── │
   │              │ ◀─result──────── │                │
   │              │  {temp:22}       │                │
   │              │                  │                │
   │              │ ──LLM API调用──▶ │                │
   │              │   (带工具结果)    │                │
   │              │ ◀─最终回答────── │                │
   │              │                  │                │
   │ ◀──"22°C"───│                  │                │
   │              │                  │                │

  关键点: Client 是中间人
  - Client 知道有哪些 MCP Server 可用
  - Client 把 Server 的工具定义告诉 LLM
  - LLM 决定用什么工具 → Client 转发给对应 Server
  - Server 执行后返回结果 → Client 喂给 LLM
```

---

## MCP 消息格式（JSON-RPC 2.0）

```
MCP 基于 JSON-RPC 2.0 协议:

  初始化握手:
  Client → Server:
  {
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "clientInfo": { "name": "claude-code", "version": "1.0" },
      "capabilities": { ... }
    },
    "id": 1
  }

  Server → Client:
  {
    "jsonrpc": "2.0",
    "result": {
      "protocolVersion": "2025-03-26",
      "serverInfo": { "name": "weather-server", "version": "1.0" },
      "capabilities": {
        "tools": {}      // 支持工具
      }
    },
    "id": 1
  }

  列出工具:
  Client → Server: { "method": "tools/list", "id": 2 }
  Server → Client: {
    "result": {
      "tools": [{
        "name": "get_weather",
        "description": "获取天气",
        "inputSchema": {
          "type": "object",
          "properties": {
            "city": { "type": "string" }
          }
        }
      }]
    }
  }

  调用工具:
  Client → Server: {
    "method": "tools/call",
    "params": {
      "name": "get_weather",
      "arguments": { "city": "北京" }
    },
    "id": 3
  }
  Server → Client: {
    "result": {
      "content": [{
        "type": "text",
        "text": "北京: 22°C, 晴"
      }]
    }
  }
```

---

## 传输层

```
MCP 支持两种传输方式:

  1. stdio（标准输入输出）— 本地进程通信
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │  Client                        Server            │
  │  (父进程)                      (子进程)           │
  │     │                             │              │
  │     │──── stdin (JSON-RPC) ──────▶│              │
  │     │◀─── stdout (JSON-RPC) ─────│              │
  │     │                             │              │
  │  Client 启动 Server 作为子进程                    │
  │  通过管道通信，简单高效                            │
  │  适合: 本地工具（文件系统、Git 等）                 │
  │                                                  │
  └──────────────────────────────────────────────────┘

  2. Streamable HTTP — HTTP 远程通信（2025-03-26 版本起的标准方案）
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │  Client                        Server            │
  │  (本地)                        (远程)            │
  │     │                             │              │
  │     │── HTTP POST (JSON-RPC) ────▶│              │
  │     │◀─ HTTP 响应 / SSE 流 ───────│              │
  │     │                             │              │
  │  单一 endpoint，SSE 为可选流式增强  │              │
  │  支持 Mcp-Session-Id 管理会话      │              │
  │  适合: 远程服务、云端 MCP Server    │              │
  │                                                  │
  └──────────────────────────────────────────────────┘

  ⚠️  旧版 HTTP+SSE（双端点模式）已在 2025-03-26 规范中标记为 deprecated，
      新实现应直接使用 Streamable HTTP。

  3. 授权（2025-03-26 新增）
  ┌──────────────────────────────────────────────────┐
  │  MCP 协议正式定义 OAuth 2.1 + PKCE 授权流程      │
  │  支持 Dynamic Client Registration (RFC7591)       │
  │  适合: 需要身份验证的生产级 MCP Server             │
  └──────────────────────────────────────────────────┘
```

**下一节：** [02 - Go 实现 MCP Server](02-mcp-server-go.md)
