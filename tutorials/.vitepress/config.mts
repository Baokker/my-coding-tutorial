import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '编程学习教程',
  description: 'Go / Java / AI / 高并发 / 云原生 全栈学习路线',
  lang: 'zh-CN',
  base: '/my-coding-tutorial/',

  themeConfig: {
    logo: '📚',
    nav: [
      { text: '首页', link: '/' },
      { text: '学习路线', link: '/README' },
      {
        text: '基础语言',
        items: [
          { text: 'Go 语言基础', link: '/01-go-basics/README' },
          { text: 'Java 高并发', link: '/02-java-concurrency/README' },
        ],
      },
      {
        text: '架构 & 基础设施',
        items: [
          { text: '高并发架构', link: '/03-architecture/README' },
          { text: 'Docker & K8s', link: '/09-docker-k8s/README' },
          { text: '消息队列深入', link: '/10-message-queue-deep/README' },
          { text: 'Grafana 监控', link: '/12-grafana-monitoring/README' },
        ],
      },
      {
        text: 'AI 技术栈',
        items: [
          { text: 'AI Agent', link: '/04-agent/README' },
          { text: 'RAG', link: '/05-rag/README' },
          { text: 'MCP', link: '/06-mcp/README' },
          { text: 'Claude Code', link: '/07-claude-code/README' },
          { text: 'OpenClaw & OpenCode', link: '/08-openclaw-opencode/README' },
          { text: '向量数据库', link: '/11-vector-database/README' },
          { text: 'LangChain4j', link: '/13-langchain4j/README' },
        ],
      },
    ],

    sidebar: {
      '/01-go-basics/': [
        {
          text: '01 · Go 语言基础',
          items: [
            { text: '模块概览', link: '/01-go-basics/README' },
            { text: '语法速览', link: '/01-go-basics/01-syntax-overview' },
            { text: '复合类型', link: '/01-go-basics/02-composite-types' },
            { text: '函数与接口', link: '/01-go-basics/03-functions-and-interfaces' },
            { text: '并发（GMP）', link: '/01-go-basics/04-concurrency' },
            { text: '实战：爬虫', link: '/01-go-basics/05-practical-project' },
          ],
        },
      ],
      '/02-java-concurrency/': [
        {
          text: '02 · Java 高并发',
          items: [
            { text: '模块概览', link: '/02-java-concurrency/README' },
            { text: '线程基础', link: '/02-java-concurrency/01-thread-basics' },
            { text: 'Java 内存模型', link: '/02-java-concurrency/02-jmm' },
            { text: 'JUC 工具箱', link: '/02-java-concurrency/03-juc-toolkit' },
            { text: '线程池', link: '/02-java-concurrency/04-threadpool' },
            { text: '实战：订单系统', link: '/02-java-concurrency/05-practical-project' },
          ],
        },
      ],
      '/03-architecture/': [
        {
          text: '03 · 高并发架构',
          items: [
            { text: '模块概览', link: '/03-architecture/README' },
            { text: '缓存设计', link: '/03-architecture/01-caching' },
            { text: '消息队列', link: '/03-architecture/02-message-queue' },
            { text: '限流 & 熔断', link: '/03-architecture/03-rate-limiting' },
            { text: '分库分表', link: '/03-architecture/04-sharding' },
          ],
        },
      ],
      '/04-agent/': [
        {
          text: '04 · AI Agent',
          items: [
            { text: '模块概览', link: '/04-agent/README' },
            { text: 'Agent 核心概念', link: '/04-agent/01-agent-concepts' },
            { text: 'Go 实现 Agent', link: '/04-agent/02-build-agent-in-go' },
          ],
        },
      ],
      '/05-rag/': [
        {
          text: '05 · RAG',
          items: [
            { text: '模块概览', link: '/05-rag/README' },
            { text: 'RAG 全链路详解', link: '/05-rag/01-rag-pipeline' },
            { text: 'Go 实现 RAG', link: '/05-rag/02-rag-in-go' },
          ],
        },
      ],
      '/06-mcp/': [
        {
          text: '06 · MCP',
          items: [
            { text: '模块概览', link: '/06-mcp/README' },
            { text: 'MCP 协议详解', link: '/06-mcp/01-mcp-protocol' },
            { text: 'Go 实现 MCP Server', link: '/06-mcp/02-mcp-server-go' },
          ],
        },
      ],
      '/07-claude-code/': [
        {
          text: '07 · Claude Code',
          items: [
            { text: '模块概览', link: '/07-claude-code/README' },
            { text: '架构分析', link: '/07-claude-code/01-architecture' },
            { text: '核心技术详解', link: '/07-claude-code/02-core-techniques' },
          ],
        },
      ],
      '/08-openclaw-opencode/': [
        {
          text: '08 · OpenClaw & OpenCode',
          items: [
            { text: '模块概览', link: '/08-openclaw-opencode/README' },
            { text: 'OpenClaw 分析', link: '/08-openclaw-opencode/01-openclaw' },
            { text: 'OpenCode 分析', link: '/08-openclaw-opencode/02-opencode' },
          ],
        },
      ],
      '/09-docker-k8s/': [
        {
          text: '09 · Docker & K8s',
          items: [
            { text: '模块概览', link: '/09-docker-k8s/README' },
            { text: 'Docker 核心', link: '/09-docker-k8s/01-docker' },
            { text: 'Kubernetes', link: '/09-docker-k8s/02-kubernetes' },
          ],
        },
      ],
      '/10-message-queue-deep/': [
        {
          text: '10 · 消息队列深入',
          items: [
            { text: '模块概览', link: '/10-message-queue-deep/README' },
            { text: 'Kafka 深入原理', link: '/10-message-queue-deep/01-kafka-deep' },
            { text: 'RocketMQ 架构', link: '/10-message-queue-deep/02-rocketmq' },
          ],
        },
      ],
      '/11-vector-database/': [
        {
          text: '11 · 向量数据库',
          items: [
            { text: '模块概览', link: '/11-vector-database/README' },
            { text: 'Milvus 深入', link: '/11-vector-database/01-milvus' },
          ],
        },
      ],
      '/12-grafana-monitoring/': [
        {
          text: '12 · Grafana 监控',
          items: [
            { text: '模块概览', link: '/12-grafana-monitoring/README' },
            { text: '可观测性体系', link: '/12-grafana-monitoring/01-observability' },
          ],
        },
      ],
      '/13-langchain4j/': [
        {
          text: '13 · LangChain4j',
          items: [
            { text: '模块概览', link: '/13-langchain4j/README' },
            { text: 'LangChain4j 全解', link: '/13-langchain4j/01-langchain4j' },
          ],
        },
      ],
    },

    socialLinks: [],
    search: { provider: 'local' },
    outline: { label: '本页目录', level: [2, 3] },
    docFooter: { prev: '上一篇', next: '下一篇' },
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    langMenuLabel: '多语言',
  },
})
