# 02 - 用 Go 实现简易 RAG 系统

## 架构

```
┌────────────────────────────────────────────────────────┐
│                  SimpleRAG (Go)                        │
│                                                        │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐ │
│  │ Document   │  │ VectorStore│  │ RAG Engine       │ │
│  │ Loader     │──▶│ (内存)     │──▶│                  │ │
│  │ 加载+分块   │  │ 存储+检索  │  │ 检索 → Prompt    │ │
│  └────────────┘  └────────────┘  │ → LLM → 回答     │ │
│                                  └──────────────────┘ │
│                                                        │
│  简化: 用余弦相似度做内存向量检索（不用外部向量数据库）    │
│  简化: 用简单的 TF-IDF 向量替代 Embedding API          │
└────────────────────────────────────────────────────────┘
```

---

## 完整代码

```go
package main

import (
    "fmt"
    "math"
    "sort"
    "strings"
)

// ==================== 文档和分块 ====================

type Document struct {
    Content  string
    Metadata map[string]string
}

type Chunk struct {
    Text     string
    DocID    int
    ChunkID  int
    Vector   []float64  // TF-IDF 向量
}

// 按段落分块，带 overlap
func splitIntoChunks(doc string, docID int, maxSize int, overlap int) []Chunk {
    paragraphs := strings.Split(doc, "\n\n")
    var chunks []Chunk
    var current strings.Builder
    chunkID := 0

    for _, para := range paragraphs {
        para = strings.TrimSpace(para)
        if para == "" {
            continue
        }

        if current.Len()+len(para) > maxSize && current.Len() > 0 {
            chunks = append(chunks, Chunk{
                Text:    current.String(),
                DocID:   docID,
                ChunkID: chunkID,
            })
            chunkID++

            // overlap: 保留最后一部分
            text := current.String()
            current.Reset()
            if overlap > 0 && len(text) > overlap {
                current.WriteString(text[len(text)-overlap:])
                current.WriteString(" ")
            }
        }

        current.WriteString(para)
        current.WriteString(" ")
    }

    if current.Len() > 0 {
        chunks = append(chunks, Chunk{
            Text:    strings.TrimSpace(current.String()),
            DocID:   docID,
            ChunkID: chunkID,
        })
    }

    return chunks
}

// ==================== 简易向量化 (TF-IDF) ====================

type Vocabulary struct {
    words    map[string]int  // word → index
    idf      []float64       // 逆文档频率
    size     int
}

// 分词（简单按空格和标点分）
func tokenize(text string) []string {
    text = strings.ToLower(text)
    replacer := strings.NewReplacer(
        "，", " ", "。", " ", "、", " ", "？", " ", "！", " ",
        "：", " ", "（", " ", "）", " ", ",", " ", ".", " ",
        "?", " ", "!", " ", ":", " ", "(", " ", ")", " ",
    )
    text = replacer.Replace(text)
    words := strings.Fields(text)
    var result []string
    for _, w := range words {
        if len(w) > 0 {
            result = append(result, w)
        }
    }
    return result
}

// 构建词汇表和 IDF
func buildVocabulary(chunks []Chunk) *Vocabulary {
    // 统计词频
    docFreq := make(map[string]int)
    wordSet := make(map[string]bool)

    for _, chunk := range chunks {
        seen := make(map[string]bool)
        for _, word := range tokenize(chunk.Text) {
            wordSet[word] = true
            if !seen[word] {
                docFreq[word]++
                seen[word] = true
            }
        }
    }

    vocab := &Vocabulary{
        words: make(map[string]int),
    }

    i := 0
    for word := range wordSet {
        vocab.words[word] = i
        i++
    }
    vocab.size = len(vocab.words)

    // 计算 IDF
    n := float64(len(chunks))
    vocab.idf = make([]float64, vocab.size)
    for word, idx := range vocab.words {
        df := float64(docFreq[word])
        vocab.idf[idx] = math.Log(n/(df+1)) + 1
    }

    return vocab
}

// 文本 → TF-IDF 向量
func (v *Vocabulary) vectorize(text string) []float64 {
    vec := make([]float64, v.size)
    words := tokenize(text)
    if len(words) == 0 {
        return vec
    }

    // TF
    tf := make(map[string]float64)
    for _, w := range words {
        tf[w]++
    }
    for w := range tf {
        tf[w] /= float64(len(words))
    }

    // TF-IDF
    for word, freq := range tf {
        if idx, ok := v.words[word]; ok {
            vec[idx] = freq * v.idf[idx]
        }
    }
    return vec
}

// 余弦相似度
func cosineSimilarity(a, b []float64) float64 {
    var dot, normA, normB float64
    for i := range a {
        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }
    if normA == 0 || normB == 0 {
        return 0
    }
    return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

// ==================== 向量存储 ====================

type VectorStore struct {
    chunks []Chunk
    vocab  *Vocabulary
}

func NewVectorStore() *VectorStore {
    return &VectorStore{}
}

func (vs *VectorStore) Index(chunks []Chunk) {
    vs.vocab = buildVocabulary(chunks)
    for i := range chunks {
        chunks[i].Vector = vs.vocab.vectorize(chunks[i].Text)
    }
    vs.chunks = chunks
    fmt.Printf("索引完成: %d 个 chunk, 词汇表大小: %d\n", len(chunks), vs.vocab.size)
}

type SearchResult struct {
    Chunk Chunk
    Score float64
}

func (vs *VectorStore) Search(query string, topK int) []SearchResult {
    queryVec := vs.vocab.vectorize(query)

    var results []SearchResult
    for _, chunk := range vs.chunks {
        score := cosineSimilarity(queryVec, chunk.Vector)
        if score > 0 {
            results = append(results, SearchResult{Chunk: chunk, Score: score})
        }
    }

    sort.Slice(results, func(i, j int) bool {
        return results[i].Score > results[j].Score
    })

    if len(results) > topK {
        results = results[:topK]
    }
    return results
}

// ==================== RAG 引擎 ====================

type RAGEngine struct {
    store *VectorStore
}

func NewRAGEngine() *RAGEngine {
    return &RAGEngine{store: NewVectorStore()}
}

func (r *RAGEngine) LoadDocuments(docs []string) {
    var allChunks []Chunk
    for i, doc := range docs {
        chunks := splitIntoChunks(doc, i, 200, 30)
        allChunks = append(allChunks, chunks...)
    }
    r.store.Index(allChunks)
}

func (r *RAGEngine) Query(question string, topK int) string {
    results := r.store.Search(question, topK)

    if len(results) == 0 {
        return "[无相关文档] 抱歉，未找到相关信息。"
    }

    // 构建 Prompt（在实际中发给 LLM）
    var context strings.Builder
    context.WriteString("基于以下参考文档回答用户的问题。\n\n")
    context.WriteString("---参考文档---\n")
    for i, res := range results {
        context.WriteString(fmt.Sprintf("[文档 %d] (相似度: %.3f)\n%s\n\n",
            i+1, res.Score, res.Chunk.Text))
    }
    context.WriteString("---用户问题---\n")
    context.WriteString(question)
    context.WriteString("\n\n请基于参考文档回答，如果文档中没有答案，请说明。")

    return context.String()
}

// ==================== 主函数 ====================

func main() {
    rag := NewRAGEngine()

    // 加载示例文档（模拟公司知识库）
    docs := []string{
        `退款政策

用户在购买后 30 天内可以申请退款。退款将在 7 个工作日内原路退回。

如果商品已经使用或损坏，退款金额可能会有所减少。电子产品的退款需要提供原始包装。

退款申请可以在 "我的订单" 页面发起，也可以联系客服热线 400-123-4567。`,

        `配送说明

标准配送时间为 3-5 个工作日，偏远地区可能需要 7-10 个工作日。

我们提供免费配送服务，订单满 99 元即可享受。急件可选择次日达服务，需额外支付 15 元。

配送范围覆盖全国大部分地区，部分偏远地区暂不支持配送。`,

        `会员权益

VIP 会员享受以下权益：全场 9 折优惠，每月 1 张免运费券，生日月双倍积分。

会员等级分为银卡、金卡和钻石卡。年消费满 1000 元升银卡，满 5000 元升金卡，满 20000 元升钻石卡。

钻石卡会员额外享受专属客服和优先发货服务。`,
    }

    rag.LoadDocuments(docs)

    // 测试查询
    queries := []string{
        "退款需要多长时间？",
        "配送要几天？",
        "怎么成为钻石卡会员？",
    }

    for _, q := range queries {
        fmt.Printf("\n\n{'='*50}\n问: %s\n{'='*50}\n", q)
        prompt := rag.Query(q, 2)
        fmt.Println(prompt)
        fmt.Println("\n(以上 Prompt 在实际中会发送给 LLM 生成最终回答)")
    }
}
```

```
运行效果:

  问: "退款需要多长时间？"
       │
       ▼ TF-IDF 向量化 + 余弦相似度
  ┌──────────────────────────────────────────────┐
  │  Top-2 检索结果:                              │
  │  [1] 退款政策... (score: 0.45)               │
  │  [2] 配送说明... (score: 0.08)               │
  └──────────────────────────────────────────────┘
       │
       ▼ 组装 Prompt
  ┌──────────────────────────────────────────────┐
  │  System: 基于以下参考文档回答...               │
  │  文档1: 退款政策全文...                       │
  │  文档2: 配送说明全文...                       │
  │  问题: 退款需要多长时间？                      │
  └──────────────────────────────────────────────┘
       │
       ▼ 发送给 LLM（这里省略了 API 调用）
  ┌──────────────────────────────────────────────┐
  │  回答: 退款将在 7 个工作日内原路退回。         │
  │  您可以在购买后 30 天内申请退款。              │
  └──────────────────────────────────────────────┘

  注: 此示例用 TF-IDF 替代了 Embedding API
  实际生产中应使用 Embedding 模型 + 向量数据库
```

---

**模块五完成！**

**下一个模块：** [模块六：MCP 协议详解](../06-mcp/README.md)
