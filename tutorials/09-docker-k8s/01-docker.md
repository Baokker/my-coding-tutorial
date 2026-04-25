# 01 - Docker 核心概念与实战

## Docker 是什么？

```
传统部署 vs 容器部署：

  传统部署:                          容器部署:
  ┌───────────────────────┐         ┌───────────────────────┐
  │      App A  App B     │         │  ┌─────┐  ┌─────┐    │
  │      │      │         │         │  │App A│  │App B│    │
  │  ┌───┴──────┴───┐     │         │  │Libs │  │Libs │    │
  │  │  Libs / Deps  │     │         │  └──┬──┘  └──┬──┘    │
  │  ├───────────────┤     │         │  ┌──┴────────┴──┐    │
  │  │  OS (Ubuntu)  │     │         │  │ Docker Engine │    │
  │  ├───────────────┤     │         │  ├──────────────┤    │
  │  │  Hardware     │     │         │  │  Host OS     │    │
  │  └───────────────┘     │         │  ├──────────────┤    │
  │                        │         │  │  Hardware    │    │
  │  问题:                  │         │  └──────────────┘    │
  │  • "在我电脑上能跑"     │         │                       │
  │  • 依赖冲突            │         │  优势:                 │
  │  • 环境不一致           │         │  • 环境一致            │
  │  • 部署慢              │         │  • 互相隔离            │
  └───────────────────────┘         │  • 秒级启动            │
                                    │  • 轻量（共享内核）     │
                                    └───────────────────────┘

  Docker vs 虚拟机:
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │  虚拟机:                    Docker 容器:             │
  │  ┌──────┐ ┌──────┐         ┌──────┐ ┌──────┐      │
  │  │App A │ │App B │         │App A │ │App B │      │
  │  │──────│ │──────│         │──────│ │──────│      │
  │  │Guest │ │Guest │         │ Libs │ │ Libs │      │
  │  │ OS   │ │ OS   │         └──┬───┘ └──┬───┘      │
  │  └──┬───┘ └──┬───┘            │        │          │
  │  ┌──┴────────┴───┐         ┌──┴────────┴───┐      │
  │  │  Hypervisor   │         │ Docker Engine │      │
  │  ├───────────────┤         ├───────────────┤      │
  │  │   Host OS     │         │   Host OS     │      │
  │  └───────────────┘         └───────────────┘      │
  │                                                     │
  │  每个VM一个完整OS            共享宿主内核             │
  │  启动: 分钟级                启动: 秒级               │
  │  大小: GB级                  大小: MB级               │
  │  资源: 重                    资源: 轻                 │
  │                                                     │
  └─────────────────────────────────────────────────────┘
```

---

## 1. 核心概念：镜像、容器、仓库

```
三者的关系（类比面向对象）:

  镜像 (Image)  = 类 (Class)         只读模板
       │
       │ docker run
       ▼
  容器 (Container) = 实例 (Object)    运行中的进程
       │
       │ docker push / pull
       ▼
  仓库 (Registry) = 应用商店           存放镜像的地方
                                      Docker Hub / 私有仓库

  ┌──────────────────────────────────────────────────────────┐
  │                    镜像的分层结构                          │
  │                                                          │
  │  docker pull nginx:latest                                │
  │                                                          │
  │  ┌────────────────────────────┐  ← Layer 4: nginx 配置   │
  │  ├────────────────────────────┤  ← Layer 3: nginx 二进制  │
  │  ├────────────────────────────┤  ← Layer 2: 安装依赖      │
  │  ├────────────────────────────┤  ← Layer 1: 基础文件      │
  │  ├────────────────────────────┤  ← Base: debian:slim     │
  │  └────────────────────────────┘                          │
  │                                                          │
  │  每一层都是只读的（Union FS 联合文件系统）                 │
  │  多个镜像可以共享底层（节省磁盘空间）                      │
  │                                                          │
  │  运行容器时，在最上面加一层可写层:                          │
  │  ┌────────────────────────────┐  ← 可写层（容器运行时）   │
  │  ├────────────────────────────┤  ← Layer 4 (只读)        │
  │  ├────────────────────────────┤  ← Layer 3 (只读)        │
  │  ├────────────────────────────┤  ← ...                   │
  │  └────────────────────────────┘                          │
  │                                                          │
  │  容器删除后，可写层也删除（数据丢失！）                    │
  │  → 需要持久化的数据用 Volume                              │
  └──────────────────────────────────────────────────────────┘
```

---

## 2. Docker 常用命令

```bash
# === 镜像操作 ===
docker pull nginx:latest          # 拉取镜像
docker images                     # 查看本地镜像
docker rmi nginx:latest           # 删除镜像
docker build -t myapp:1.0 .       # 构建镜像

# === 容器操作 ===
docker run -d --name web \
  -p 8080:80 \                    # 端口映射: 宿主8080 → 容器80
  -v /data:/app/data \            # 目录挂载: 宿主/data → 容器/app/data
  -e APP_ENV=production \         # 环境变量
  --restart=always \              # 自动重启
  nginx:latest

docker ps                         # 查看运行中的容器
docker ps -a                      # 查看所有容器（含已停止）
docker logs -f web                # 实时查看日志
docker exec -it web /bin/sh       # 进入容器内部
docker stop web                   # 停止容器
docker rm web                     # 删除容器

# === 网络 ===
docker network create mynet       # 创建网络
docker run --network mynet ...    # 加入网络
```

```
端口映射与网络:

  宿主机
  ┌──────────────────────────────────────────┐
  │                                          │
  │   浏览器 → localhost:8080                 │
  │              │                           │
  │              │  -p 8080:80               │
  │              ▼                           │
  │   ┌─────────────────────┐               │
  │   │  容器: nginx         │               │
  │   │  监听端口: 80        │               │
  │   └─────────────────────┘               │
  │                                          │
  │   多容器通信（同一个 docker network）:     │
  │   ┌─────────┐    ┌─────────┐            │
  │   │  app    │───▶│  redis  │            │
  │   │         │    │         │            │
  │   │ redis:  │    │ :6379   │            │
  │   │ 6379   │    │         │            │
  │   └─────────┘    └─────────┘            │
  │   同一网络内，容器名就是域名               │
  │   app 中连接 redis → redis:6379          │
  │                                          │
  └──────────────────────────────────────────┘
```

---

## 3. Dockerfile — 构建自己的镜像

### Go 应用的 Dockerfile

```dockerfile
# === 多阶段构建（Multi-stage Build）===
# 阶段一：编译
FROM golang:1.22-alpine AS builder

WORKDIR /app

# 先拷贝依赖文件（利用缓存层）
COPY go.mod go.sum ./
RUN go mod download

# 拷贝源码并编译
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server

# 阶段二：运行（极小镜像）
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app

# 只从 builder 阶段拷贝编译好的二进制
COPY --from=builder /app/server .
COPY --from=builder /app/configs ./configs

EXPOSE 8080

ENTRYPOINT ["./server"]
```

```
多阶段构建的优势:

  单阶段:                          多阶段:
  ┌──────────────────────┐         ┌──────────────────────┐
  │  golang:1.22 (800MB) │         │  阶段1: golang:1.22  │
  │  ┌────────────────┐  │         │  编译 → 产出二进制    │
  │  │ Go 编译器      │  │         └──────────┬───────────┘
  │  │ 源码           │  │                    │ 只拷贝二进制
  │  │ 编译产物       │  │         ┌──────────▼───────────┐
  │  │ 测试工具       │  │         │  阶段2: alpine (5MB) │
  │  └────────────────┘  │         │  ┌────────────────┐  │
  │                      │         │  │ 二进制 (10MB)  │  │
  │  镜像大小: ~900MB    │         │  └────────────────┘  │
  └──────────────────────┘         │                      │
                                   │  镜像大小: ~15MB     │
                                   └──────────────────────┘
                                   体积缩小 60 倍!

  Dockerfile 最佳实践:
  ┌─────────────────────────────────────────────────────┐
  │  1. 用多阶段构建，最终镜像不含编译工具                 │
  │  2. 先 COPY go.mod → go mod download → 再 COPY .   │
  │     → 依赖不变时利用 Docker 缓存，加速构建            │
  │  3. 用 alpine 作为运行基础镜像（极小）                │
  │  4. 不要用 root 运行（安全）                          │
  │  5. 一个容器只运行一个进程                            │
  └─────────────────────────────────────────────────────┘
```

---

## 4. Docker Compose — 多容器编排

```yaml
# docker-compose.yml
# 一个典型的 Go Web 应用 + Redis + PostgreSQL

version: '3.8'

services:
  app:
    build: .                          # 用当前目录的 Dockerfile 构建
    ports:
      - "8080:8080"
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - REDIS_HOST=redis
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: always

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret
    volumes:
      - pg_data:/var/lib/postgresql/data   # 持久化数据
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb
    volumes:
      - redis_data:/data

volumes:
  pg_data:
  redis_data:
```

```
Docker Compose 架构:

  docker compose up -d

  ┌──────────────────────────────────────────────────┐
  │  Docker Compose 管理的容器集群                     │
  │                                                  │
  │  ┌──────────┐                                    │
  │  │   app    │──:8080──▶ 宿主机:8080              │
  │  │  (Go)    │                                    │
  │  └────┬──┬──┘                                    │
  │       │  │                                       │
  │       │  └─────────────────┐                     │
  │       ▼                    ▼                     │
  │  ┌──────────┐        ┌──────────┐               │
  │  │ postgres │        │  redis   │               │
  │  │ :5432    │        │  :6379   │               │
  │  └────┬─────┘        └────┬─────┘               │
  │       │                   │                      │
  │  ┌────▼─────┐        ┌────▼─────┐               │
  │  │ pg_data  │        │redis_data│  ← Volumes    │
  │  │ (持久化)  │        │ (持久化) │   容器删了数据还在│
  │  └──────────┘        └──────────┘               │
  │                                                  │
  │  所有容器自动加入同一个网络                         │
  │  容器间通过服务名通信: postgres:5432               │
  └──────────────────────────────────────────────────┘

  常用命令:
  docker compose up -d         # 后台启动所有服务
  docker compose ps            # 查看状态
  docker compose logs -f app   # 看 app 日志
  docker compose down          # 停止并删除
  docker compose down -v       # 连 volume 一起删
```

---

## 5. 小结

```
┌──────────────────────────────────────────────────────────┐
│  Docker 速查                                             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  核心概念:                                                │
│  ├── 镜像 = 只读模板（分层结构）                          │
│  ├── 容器 = 镜像的运行实例                                │
│  ├── Volume = 持久化存储                                  │
│  └── Network = 容器间通信                                 │
│                                                          │
│  Dockerfile 要点:                                        │
│  ├── 多阶段构建（编译镜像 vs 运行镜像）                   │
│  ├── 利用缓存层（不变的放前面）                           │
│  └── 最终镜像越小越好                                     │
│                                                          │
│  Compose = 本地开发利器:                                  │
│  └── 一键启动整个技术栈                                   │
│                                                          │
│  生产环境: Docker + K8s (下一节)                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**下一节：** [02 - Kubernetes](02-kubernetes.md)
