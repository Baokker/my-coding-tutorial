# 编程学习教程

Go / Java / AI / 高并发 / 云原生 全栈学习路线，共 13 个模块、44 个教程文件。

## 启动

确保已安装 [Node.js](https://nodejs.org/) v18+，然后：

```bash
# 第一次使用，安装依赖（只需执行一次）
npm install

# 启动本地文档站
npm run docs:dev
```

浏览器打开 http://localhost:5173 即可阅读。

## 其他命令

```bash
# 构建静态文件（输出到 tutorials/.vitepress/dist/）
npm run docs:build

# 预览构建结果
npm run docs:preview
```

## 教程目录

| 模块 | 内容 |
|------|------|
| 01 Go 语言基础 | 语法、复合类型、GMP 并发、实战爬虫 |
| 02 Java 高并发 | 线程、JMM、JUC、线程池、实战订单系统 |
| 03 高并发架构 | 缓存、消息队列、限流熔断、分库分表 |
| 04 AI Agent | ReAct 模式、Go 实现 Agent |
| 05 RAG | 全链路详解、Go 实现 |
| 06 MCP | 协议详解、Go 实现 MCP Server |
| 07 Claude Code | 架构分析、核心技术 |
| 08 OpenClaw & OpenCode | 开源工具架构分析与对比 |
| 09 Docker & K8s | 容器化、Dockerfile、K8s 部署 |
| 10 消息队列深入 | Kafka 原理、RocketMQ 架构 |
| 11 向量数据库 | HNSW/IVF 索引、Milvus、Go SDK |
| 12 Grafana 监控 | 可观测性三支柱、Prometheus、Go 埋点 |
| 13 LangChain4j | AI Services、RAG、Tool Use、Spring Boot |
