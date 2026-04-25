# 模块六：MCP（Model Context Protocol）协议详解

> 🎯 目标：理解 MCP 协议设计和实际用途，能写一个 MCP Server

```
┌──────────────────────────────────────────────────────────────┐
│                     MCP 是什么？                              │
│                                                              │
│  问题: 每个 AI 工具都自己实现一套工具系统                      │
│       Claude Code 有自己的 Tool                              │
│       ChatGPT 有 Function Calling                            │
│       每接一个数据源都要适配，N×M 的对接问题                   │
│                                                              │
│  MCP = AI 工具的 "USB 标准接口"                               │
│                                                              │
│  之前:                         之后 (MCP):                    │
│  ┌─────┐──┐  ┌──┌─────┐      ┌─────┐     ┌─────┐          │
│  │App A│  ├──┤  │DB   │      │App A│─┐   │DB   │          │
│  └─────┘  │  │  └─────┘      └─────┘ │   └──┬──┘          │
│  ┌─────┐  │  │  ┌─────┐      ┌─────┐ │      │             │
│  │App B│──┘  └──│Git  │      │App B│─┼─MCP──┤             │
│  └─────┘     ┌──└─────┘      └─────┘ │      │             │
│  ┌─────┐  ┌──┤  ┌─────┐      ┌─────┐ │   ┌──┴──┐          │
│  │App C│──┘  └──│Slack│      │App C│─┘   │Git  │          │
│  └─────┘        └─────┘      └─────┘     └─────┘          │
│  N×M 条连接                   N+M 条连接                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

| 序号 | 文件 | 内容 |
|------|------|------|
| 01 | [MCP 协议详解](01-mcp-protocol.md) | 架构、核心概念、通信流程 |
| 02 | [Go 实现 MCP Server](02-mcp-server-go.md) | 从零写一个 MCP Server |

## 推荐资源

- 📖 [MCP 官方文档](https://modelcontextprotocol.io)
- 📖 [MCP 规范](https://spec.modelcontextprotocol.io)
- 📺 [Anthropic MCP 发布博客](https://www.anthropic.com/news/model-context-protocol)
