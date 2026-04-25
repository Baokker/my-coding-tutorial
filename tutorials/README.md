# 编程学习教程

## 目录总览

```
┌────────────────────────────────────────────────────────────────┐
│                      学习路线图                                 │
│                                                                │
│   基础语言                 高并发                 AI/工具        │
│   ──────────              ──────                ─────────     │
│                                                                │
│   ┌──────────┐                                                 │
│   │ 01 Go    │────┐                                            │
│   │ 语言基础  │    │      ┌──────────────┐                      │
│   └──────────┘    ├─────▶│ 03 高并发     │                      │
│   ┌──────────┐    │      │ 架构设计     │                      │
│   │ 02 Java  │────┘      └──────────────┘                      │
│   │ 高并发    │                                                 │
│   └──────────┘                                                 │
│                                                                │
│   基础设施 & 中间件          AI 技术栈                           │
│   ─────────────────         ───────────                        │
│                                                                │
│   ┌──────────┐  ┌──────┐   ┌──────────┐  ┌──────┐  ┌──────┐ │
│   │09 Docker │  │10 MQ │   │ 04 Agent │─▶│05 RAG│─▶│06 MCP│ │
│   │ K8s      │  │ 深入  │   │ 架构     │  │      │  │      │ │
│   └──────────┘  └──────┘   └──────────┘  └──────┘  └──────┘ │
│                                                                │
│   ┌──────────┐  ┌──────┐   ┌──────────────┐  ┌────────────┐  │
│   │11 向量DB │  │12 监控│   │ 07 Claude    │  │08 OpenClaw │  │
│   │ Milvus   │  │Grafana│   │ Code 原理    │  │ & OpenCode │  │
│   └──────────┘  └──────┘   └──────────────┘  └────────────┘  │
│                                                                │
│   ┌─────────────────────┐                                      │
│   │ 13 LangChain4j      │                                      │
│   │ Java AI 开发框架     │                                      │
│   └─────────────────────┘                                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## 模块列表

| 模块 | 目录 | 子文件数 | 内容概要 |
|------|------|---------|---------|
| 01 | [Go 语言基础](01-go-basics/README) | 5 + README | 语法、复合类型、函数接口、并发(GMP)、实战爬虫 |
| 02 | [Java 高并发](02-java-concurrency/README) | 5 + README | 线程、JMM、JUC、线程池、实战订单系统 |
| 03 | [高并发架构](03-architecture/README) | 4 + README | 缓存、消息队列、限流熔断、分库分表 |
| 04 | [AI Agent](04-agent/README) | 2 + README | ReAct 模式、Go 实现 Agent |
| 05 | [RAG](05-rag/README) | 2 + README | 全链路详解、Go 实现 RAG |
| 06 | [MCP](06-mcp/README) | 2 + README | 协议详解、Go 实现 MCP Server |
| 07 | [Claude Code](07-claude-code/README) | 2 + README | 架构分析、核心技术详解 |
| 08 | [OpenClaw & OpenCode](08-openclaw-opencode/README) | 2 + README | 开源项目架构分析与对比 |
| 09 | [Docker & K8s](09-docker-k8s/README) | 2 + README | Docker 核心、Dockerfile、K8s 架构与部署 |
| 10 | [消息队列深入](10-message-queue-deep/README) | 2 + README | Kafka 深入原理、RocketMQ 架构与对比 |
| 11 | [向量数据库 Milvus](11-vector-database/README) | 1 + README | 索引算法(HNSW/IVF)、Milvus 架构、Go SDK |
| 12 | [Grafana 监控](12-grafana-monitoring/README) | 1 + README | 可观测性三支柱、Prometheus+Grafana、Go 埋点 |
| 13 | [LangChain4j](13-langchain4j/README) | 1 + README | AI Services、RAG、Tool Use、Spring Boot 集成 |

**总计: 13 个模块，31 个教程文件 + 13 个索引 = 44 个文件**

## 建议学习顺序

**阶段一：语言基础**
1. **Go 基础**（模块一） — 恢复语法，重点学并发
2. **Java 高并发**（模块二） — 补全并发知识

**阶段二：架构与基础设施**
3. **高并发架构**（模块三） — 缓存/MQ/限流全局视野
4. **Docker & K8s**（模块九） — 容器化和编排
5. **消息队列深入**（模块十） — Kafka & RocketMQ 底层
6. **Grafana 监控**（模块十二） — 可观测性体系

**阶段三：AI 技术栈**
7. **AI Agent**（模块四） — 理解 Agent 核心循环
8. **RAG**（模块五） — 检索增强生成全链路
9. **向量数据库**（模块十一） — Milvus 深入
10. **MCP**（模块六） — 协议设计与实现
11. **LangChain4j**（模块十三） — Java AI 开发框架

**阶段四：工具底层**
12. **Claude Code**（模块七） — 架构和核心技术
13. **OpenClaw & OpenCode**（模块八） — 开源工具分析
