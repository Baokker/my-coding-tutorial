# 01 - LangChain4j 架构与实战

## LangChain4j 是什么？

```
LangChain 生态:
  LangChain (Python)  ← 最流行的 AI 应用开发框架
  LangChain.js (TS)   ← JavaScript/TypeScript 版
  LangChain4j (Java)  ← Java 版，适合企业级后端

  ┌──────────────────────────────────────────────────────────┐
  │  LangChain4j 解决的问题:                                  │
  │                                                          │
  │  不用 LangChain4j:                 用 LangChain4j:       │
  │  自己拼 HTTP 请求调 OpenAI          model.chat(msg)      │
  │  自己管理对话历史                   ChatMemory 自动管理   │
  │  自己切分文档+向量化+存储           DocumentSplitter +    │
  │  自己写 RAG 管道                    EmbeddingStore +      │
  │  自己实现 Agent 循环                ContentRetriever      │
  │  → 几百行胶水代码                   → 几行代码搞定        │
  └──────────────────────────────────────────────────────────┘
```

---

## 1. 核心架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    LangChain4j 架构                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  High-Level API (AI Services)                            │    │
│  │                                                          │    │
│  │  @AiService                                              │    │
│  │  interface MyAssistant {                                 │    │
│  │      String chat(String message);                        │    │
│  │  }                                                       │    │
│  │  → 用接口+注解声明式定义 AI 服务                          │    │
│  │  → 框架自动处理 Prompt、Tool、Memory、RAG                │    │
│  └──────────────────────────┬───────────────────────────────┘    │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐    │
│  │  Core Components (核心组件)                               │    │
│  │                                                          │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐   │    │
│  │  │ ChatModel  │ │ ChatMemory │ │ ContentRetriever   │   │    │
│  │  │            │ │            │ │ (RAG)              │   │    │
│  │  │ LLM 模型   │ │ 对话记忆    │ │ 知识检索            │   │    │
│  │  │ 调用抽象   │ │ 管理       │ │                    │   │    │
│  │  └────────────┘ └────────────┘ └────────────────────┘   │    │
│  │                                                          │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐   │    │
│  │  │ Tool       │ │ Embedding  │ │ Document           │   │    │
│  │  │            │ │ Model      │ │ Loader/Splitter    │   │    │
│  │  │ 工具调用    │ │ 向量模型    │ │ 文档加载/分块       │   │    │
│  │  └────────────┘ └────────────┘ └────────────────────┘   │    │
│  └──────────────────────────┬───────────────────────────────┘    │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐    │
│  │  Integrations (集成层)                                    │    │
│  │                                                          │    │
│  │  模型: OpenAI | Anthropic | Ollama | Zhipu | Qwen        │    │
│  │  向量: Milvus | Pinecone | Chroma | pgvector | Redis     │    │
│  │  文档: PDF | HTML | Markdown | Office                    │    │
│  │  框架: Spring Boot Starter                               │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 基础使用 — ChatModel

```java
// pom.xml 依赖
// <dependency>
//   <groupId>dev.langchain4j</groupId>
//   <artifactId>langchain4j-open-ai</artifactId>
//   <version>1.13.0</version>  <!-- 最新稳定版（2025年4月） -->
// </dependency>

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;

public class BasicChat {
    public static void main(String[] args) {
        // 创建 ChatModel
        // ⚠️ 1.x 起 modelName 和 temperature 不再有默认值，必须显式指定
        ChatLanguageModel model = OpenAiChatModel.builder()
            .apiKey(System.getenv("OPENAI_API_KEY"))
            .modelName("gpt-4o")
            .temperature(0.7)
            .build();

        // 最简单的调用（1.x 起 generate() 已改为 chat()）
        String answer = model.chat("Java 和 Go 的主要区别是什么？");
        System.out.println(answer);
    }
}
```

```
ChatModel 支持多种 LLM:

  ┌──────────────────────────────────────────────┐
  │  ChatLanguageModel                           │
  │  ├── OpenAiChatModel     (GPT-4o)           │
  │  ├── AnthropicChatModel  (Claude)           │
  │  ├── OllamaChatModel     (本地模型)          │
  │  ├── ZhipuAiChatModel    (智谱)             │
  │  ├── QwenChatModel       (通义千问)          │
  │  └── ...更多                                │
  │                                              │
  │  切换模型只需改一行代码（接口统一）            │
  └──────────────────────────────────────────────┘
```

---

## 3. AI Services — 声明式高级 API

```java
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;

// 用接口声明 AI 服务（类似 Spring 的 Feign）
interface Assistant {

    @SystemMessage("你是一个友好的编程助手，回答要简洁。")
    String chat(String message);
}

// 带结构化输出的服务
interface SentimentAnalyzer {

    @UserMessage("分析以下文本的情感: {{text}}. 回答 POSITIVE, NEGATIVE 或 NEUTRAL")
    String analyze(@V("text") String text);
}

// 带记忆的聊天服务
interface ChatBot {

    @SystemMessage("你是一个技术专家")
    String chat(@dev.langchain4j.service.MemoryId int memoryId,
                @UserMessage String message);
}

public class AiServicesDemo {
    public static void main(String[] args) {
        ChatLanguageModel model = OpenAiChatModel.builder()
            .apiKey(System.getenv("OPENAI_API_KEY"))
            .modelName("gpt-4o")
            .build();

        // 构建 AI 服务（框架自动实现接口！）
        Assistant assistant = AiServices.builder(Assistant.class)
            .chatLanguageModel(model)
            .chatMemory(MessageWindowChatMemory.withMaxMessages(20))
            .build();

        // 使用就像调普通方法
        String answer1 = assistant.chat("Go 的 goroutine 是什么？");
        String answer2 = assistant.chat("它和 Java 线程有什么区别？");
        // 有记忆! answer2 知道 "它" 指 goroutine
    }
}
```

```
AiServices 自动做了什么:

  你写的接口:                    框架自动生成的实现:
  ┌────────────────────┐        ┌──────────────────────────┐
  │  interface Assistant│        │  class AssistantImpl {    │
  │  {                 │        │    ChatModel model;      │
  │    String chat(    │  ──▶   │    ChatMemory memory;    │
  │      String msg);  │        │                          │
  │  }                 │        │    String chat(msg) {    │
  │                    │        │      msgs = memory.get();│
  │  @SystemMessage    │        │      msgs.add(system);   │
  │  "你是助手"         │        │      msgs.add(user:msg);│
  └────────────────────┘        │      resp = model.call();│
                                │      memory.add(resp);   │
                                │      return resp.text(); │
                                │    }                     │
                                │  }                       │
                                └──────────────────────────┘
```

---

## 4. RAG 实现

```java
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.splitter.DocumentSplitters;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import dev.langchain4j.rag.content.retriever.EmbeddingStoreContentRetriever;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import dev.langchain4j.store.embedding.EmbeddingStoreIngestor;

public class RAGDemo {
    public static void main(String[] args) {

        // 1. Embedding 模型
        EmbeddingModel embeddingModel = OpenAiEmbeddingModel.builder()
            .apiKey(System.getenv("OPENAI_API_KEY"))
            .modelName("text-embedding-3-small")
            .build();

        // 2. 向量存储（可替换为 Milvus、Pinecone 等）
        EmbeddingStore<TextSegment> embeddingStore =
            new InMemoryEmbeddingStore<>();

        // 3. 文档加载 + 分块 + 向量化 + 存储
        EmbeddingStoreIngestor ingestor = EmbeddingStoreIngestor.builder()
            .documentSplitter(DocumentSplitters.recursive(500, 50))
            .embeddingModel(embeddingModel)
            .embeddingStore(embeddingStore)
            .build();

        // 加载文档
        Document doc1 = Document.from("退款政策: 购买后30天内可退款，7个工作日到账。");
        Document doc2 = Document.from("配送说明: 标准配送3-5个工作日，满99元免运费。");
        Document doc3 = Document.from("会员权益: 钻石卡年消费满20000元可升级。");

        ingestor.ingest(doc1, doc2, doc3);

        // 4. 构建 RAG 检索器
        EmbeddingStoreContentRetriever retriever =
            EmbeddingStoreContentRetriever.builder()
                .embeddingStore(embeddingStore)
                .embeddingModel(embeddingModel)
                .maxResults(3)
                .minScore(0.6)
                .build();

        // 5. 构建带 RAG 的 AI 服务
        ChatLanguageModel chatModel = OpenAiChatModel.builder()
            .apiKey(System.getenv("OPENAI_API_KEY"))
            .modelName("gpt-4o")
            .build();

        interface KnowledgeAssistant {
            String answer(String question);
        }

        KnowledgeAssistant assistant = AiServices.builder(KnowledgeAssistant.class)
            .chatLanguageModel(chatModel)
            .contentRetriever(retriever)  // 注入 RAG!
            .build();

        // 使用
        String answer = assistant.answer("退款要多久到账？");
        System.out.println(answer);
        // 输出: 根据退款政策，退款将在 7 个工作日内原路退回。
    }
}
```

```
LangChain4j RAG 流程:

  assistant.answer("退款要多久?")
       │
       ▼
  ┌──────────────────────────────────────────────────┐
  │  ContentRetriever                                │
  │                                                  │
  │  1. 把问题向量化                                  │
  │     "退款要多久?" → [0.12, 0.85, ...]            │
  │                                                  │
  │  2. 在 EmbeddingStore 中搜索相似文档              │
  │     → "退款政策: 购买后30天内可退款..." (0.92)     │
  │     → "配送说明: 标准配送..." (0.31)              │
  │                                                  │
  │  3. 过滤 minScore < 0.6 的结果                    │
  └───────────────────────┬──────────────────────────┘
                          │ 检索到的文档
                          ▼
  ┌──────────────────────────────────────────────────┐
  │  自动构建 Prompt:                                 │
  │                                                  │
  │  System: 根据以下信息回答用户问题                  │
  │  Context: 退款政策: 购买后30天内可退款，7个工作... │
  │  User: 退款要多久到账？                           │
  └───────────────────────┬──────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────┐
  │  LLM 生成回答:                                    │
  │  "根据退款政策，退款将在 7 个工作日内原路退回。"     │
  └──────────────────────────────────────────────────┘

  替换向量存储为 Milvus:
  只需改一行:
  EmbeddingStore<TextSegment> store = MilvusEmbeddingStore.builder()
      .host("localhost").port(19530)
      .collectionName("docs")
      .build();
```

---

## 5. Tool Use（工具调用）

```java
import dev.langchain4j.agent.tool.Tool;

// 定义工具类
class MathTools {

    @Tool("计算两个数的加法")
    public double add(double a, double b) {
        return a + b;
    }

    @Tool("计算两个数的乘法")
    public double multiply(double a, double b) {
        return a * b;
    }

    @Tool("获取当前日期时间")
    public String getCurrentTime() {
        return java.time.LocalDateTime.now().toString();
    }
}

// 创建带工具的 AI 服务
interface ToolAssistant {
    String chat(String message);
}

ToolAssistant assistant = AiServices.builder(ToolAssistant.class)
    .chatLanguageModel(model)
    .tools(new MathTools())   // 注入工具!
    .build();

String answer = assistant.chat("现在几点了？另外帮我算 25 * 37");
// LLM 会自动调用 getCurrentTime() 和 multiply(25, 37)
```

```
LangChain4j Tool 调用流程 (和 Claude Code 原理相同!):

  用户: "25 * 37 等于多少?"
       │
       ▼
  LLM 推理: 我需要用 multiply 工具
       │
       ▼
  框架执行: MathTools.multiply(25, 37) → 925
       │
       ▼
  LLM 回答: "25 × 37 = 925"

  ┌──────────────────────────────────────────────────────────┐
  │  @Tool 注解的方法 = Agent 的 "手和脚"                     │
  │                                                          │
  │  LangChain4j 自动:                                       │
  │  1. 把 @Tool 方法转成 JSON Schema 告诉 LLM               │
  │  2. LLM 返回 tool_call 时自动调用对应方法                  │
  │  3. 把结果喂回 LLM 继续推理                               │
  │  4. 循环直到 LLM 给出最终答案                              │
  │                                                          │
  │  → 本质上就是模块四讲的 Agent Loop!                        │
  │     LangChain4j 帮你封装好了                               │
  └──────────────────────────────────────────────────────────┘
```

---

## 6. 与 Spring Boot 集成

```yaml
# application.yml
langchain4j:
  open-ai:
    chat-model:
      api-key: ${OPENAI_API_KEY}
      model-name: gpt-4o
    embedding-model:
      api-key: ${OPENAI_API_KEY}
      model-name: text-embedding-3-small
```

```java
// pom.xml: langchain4j-spring-boot-starter

@SpringBootApplication
public class App { ... }

@AiService  // Spring 自动注册为 Bean!
interface MyAssistant {
    @SystemMessage("你是一个客服助手")
    String chat(@MemoryId String sessionId, @UserMessage String msg);
}

@RestController
class ChatController {
    @Autowired
    MyAssistant assistant;  // 直接注入!

    @PostMapping("/chat")
    String chat(@RequestParam String sessionId, @RequestBody String message) {
        return assistant.chat(sessionId, message);
    }
}
```

---

## 7. 小结

```
┌──────────────────────────────────────────────────────────────┐
│  LangChain4j 速查                                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  核心组件:                                                    │
│  ├── ChatLanguageModel → LLM 调用抽象                       │
│  ├── ChatMemory        → 对话记忆                            │
│  ├── AiServices        → 声明式 AI 服务 (接口+注解)          │
│  ├── @Tool             → Agent 工具调用                      │
│  ├── ContentRetriever  → RAG 检索                            │
│  └── EmbeddingStore    → 向量存储                            │
│                                                              │
│  RAG 搭建步骤:                                               │
│  ① 加载文档 → ② 分块 → ③ 向量化 → ④ 存储                   │
│  ⑤ 查询时检索 → ⑥ 拼 Prompt → ⑦ LLM 回答                  │
│  → LangChain4j 用 Ingestor + ContentRetriever 简化全流程    │
│                                                              │
│  与 Spring Boot 集成:                                        │
│  → langchain4j-spring-boot-starter                          │
│  → @AiService 自动注册为 Bean                                │
│  → 几行配置 + 一个接口 = 完整 AI 服务                        │
│                                                              │
│  对比 Python LangChain:                                      │
│  ├── 概念基本对齐，Java 开发者上手快                         │
│  ├── AiServices 比 Python 的 Chain 更声明式                 │
│  └── 企业级项目首选（类型安全、Spring 生态）                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**模块十三完成！全部新增模块编写完毕！**
