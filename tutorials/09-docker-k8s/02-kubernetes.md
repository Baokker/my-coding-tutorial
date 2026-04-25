# 02 - Kubernetes 架构与实战

## K8s 是什么？

```
Docker Compose 管单机多容器
Kubernetes 管多机多容器（容器编排平台）

  Docker Compose:                K8s:
  ┌──────────┐                  ┌──────────┐┌──────────┐┌──────────┐
  │  单台机器  │                  │  Node 1  ││  Node 2  ││  Node 3  │
  │  ┌─┐┌─┐  │                  │  ┌─┐┌─┐  ││  ┌─┐┌─┐  ││  ┌─┐     │
  │  │A││B│  │                  │  │A││B│  ││  │A││C│  ││  │B│     │
  │  └─┘└─┘  │                  │  └─┘└─┘  ││  └─┘└─┘  ││  └─┘     │
  └──────────┘                  └──────────┘└──────────┘└──────────┘

  K8s 能做什么:
  ┌────────────────────────────────────────────────────────┐
  │  1. 自动部署: 声明要几个副本，K8s 自动分配到各节点      │
  │  2. 自动扩缩容: CPU 高了自动加 Pod，低了自动减           │
  │  3. 自动恢复: Pod 挂了自动重启/重新调度                 │
  │  4. 服务发现: Pod IP 会变，Service 提供稳定的访问入口    │
  │  5. 滚动更新: 不停机发布新版本                          │
  │  6. 配置管理: ConfigMap / Secret 管理配置和密钥         │
  └────────────────────────────────────────────────────────┘
```

---

## 1. K8s 架构

```
┌──────────────────────────────────────────────────────────────────┐
│                     Kubernetes 架构                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                 Control Plane (控制平面)                   │    │
│  │                                                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │    │
│  │  │ API Server   │  │ Scheduler    │  │ Controller    │  │    │
│  │  │              │  │              │  │ Manager       │  │    │
│  │  │ 所有操作的    │  │ 决定 Pod 放  │  │ 维护期望状态  │  │    │
│  │  │ 唯一入口     │  │ 在哪个 Node  │  │ (副本数/健康) │  │    │
│  │  └──────────────┘  └──────────────┘  └───────────────┘  │    │
│  │                                                          │    │
│  │  ┌──────────────┐                                        │    │
│  │  │ etcd         │  分布式 KV 存储，保存集群所有状态       │    │
│  │  └──────────────┘                                        │    │
│  └──────────────────────────────────────────────────────────┘    │
│                           │ kubectl / API                        │
│  ┌────────────────────────▼─────────────────────────────────┐    │
│  │                 Worker Nodes (工作节点)                    │    │
│  │                                                          │    │
│  │  Node 1                          Node 2                  │    │
│  │  ┌─────────────────────────┐    ┌──────────────────────┐ │    │
│  │  │ kubelet (节点代理)       │    │ kubelet              │ │    │
│  │  │ kube-proxy (网络代理)    │    │ kube-proxy           │ │    │
│  │  │ Container Runtime       │    │ Container Runtime    │ │    │
│  │  │                         │    │                      │ │    │
│  │  │ ┌─────┐ ┌─────┐       │    │ ┌─────┐ ┌─────┐     │ │    │
│  │  │ │Pod A│ │Pod B│       │    │ │Pod C│ │Pod D│     │ │    │
│  │  │ │┌───┐│ │┌───┐│       │    │ │┌───┐│ │┌───┐│     │ │    │
│  │  │ ││app││ ││web││       │    │ ││app││ ││db ││     │ │    │
│  │  │ │└───┘│ │└───┘│       │    │ │└───┘│ │└───┘│     │ │    │
│  │  │ └─────┘ └─────┘       │    │ └─────┘ └─────┘     │ │    │
│  │  └─────────────────────────┘    └──────────────────────┘ │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

  组件职责:
  ┌────────────────────┬───────────────────────────────────┐
  │  API Server        │ 所有请求的入口（kubectl → API）    │
  │  Scheduler         │ 把 Pod 调度到合适的 Node           │
  │  Controller Manager│ 维持期望状态（副本数、健康检查）    │
  │  etcd              │ 集群状态的唯一真相来源              │
  │  kubelet           │ 每个 Node 上的代理，管理 Pod       │
  │  kube-proxy        │ 维护网络规则，实现 Service 转发    │
  └────────────────────┴───────────────────────────────────┘
```

---

## 2. 核心资源对象

```
K8s 资源对象层次关系:

  ┌────────────────────────────────────────────────────┐
  │                                                    │
  │  Ingress (入口，域名路由)                            │
  │     │                                              │
  │     ▼                                              │
  │  Service (服务发现 + 负载均衡)                       │
  │     │                                              │
  │     ▼                                              │
  │  Deployment (无状态应用管理)                         │
  │     │    或 StatefulSet (有状态应用管理)              │
  │     ▼                                              │
  │  ReplicaSet (副本集，维护 Pod 数量)                  │
  │     │                                              │
  │     ▼                                              │
  │  Pod (最小调度单位，1~N 个容器)                      │
  │     │                                              │
  │     ▼                                              │
  │  Container (Docker 容器)                            │
  │                                                    │
  │  辅助资源:                                          │
  │  ├── ConfigMap  (配置信息)                           │
  │  ├── Secret     (敏感信息，如密码)                   │
  │  ├── PersistentVolume (持久化存储)                   │
  │  ├── HPA        (自动扩缩容)                         │
  │  └── Namespace  (命名空间，隔离环境)                  │
  │                                                    │
  └────────────────────────────────────────────────────┘
```

### Pod — 最小调度单位

```yaml
# pod.yaml — 通常不直接创建，由 Deployment 管理
apiVersion: v1
kind: Pod
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  containers:
    - name: app
      image: my-app:1.0
      ports:
        - containerPort: 8080
      resources:
        requests:          # 最低保障
          cpu: "100m"      # 0.1 核
          memory: "128Mi"
        limits:            # 最高限制
          cpu: "500m"
          memory: "512Mi"
      livenessProbe:       # 存活探针（挂了就重启）
        httpGet:
          path: /healthz
          port: 8080
        initialDelaySeconds: 10
        periodSeconds: 5
      readinessProbe:      # 就绪探针（没好就不转发流量）
        httpGet:
          path: /ready
          port: 8080
```

```
Pod 内部结构:

  ┌──────────────────────────────────┐
  │  Pod                             │
  │  ┌────────────┐ ┌────────────┐  │
  │  │ Container1 │ │ Container2 │  │   一个 Pod 可以有多个容器
  │  │ (app)      │ │ (sidecar)  │  │   共享网络和存储
  │  └──────┬─────┘ └──────┬─────┘  │
  │         │              │        │
  │         └──────┬───────┘        │
  │           共享 localhost         │
  │           共享 Volume           │
  │                                 │
  │  Probes (探针):                  │
  │  ┌─────────────┬────────────┐  │
  │  │ Liveness    │ Readiness  │  │
  │  │ "你还活着吗?"│"准备好了吗?"│  │
  │  │ 失败→重启    │ 失败→不转发 │  │
  │  └─────────────┴────────────┘  │
  └──────────────────────────────────┘
```

### Deployment + Service — 最常用的组合

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3                # 3 个副本
  selector:
    matchLabels:
      app: my-app
  strategy:
    type: RollingUpdate      # 滚动更新
    rollingUpdate:
      maxSurge: 1            # 更新时最多多 1 个
      maxUnavailable: 0      # 更新时不允许少
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: app
          image: my-app:1.0
          ports:
            - containerPort: 8080
          env:
            - name: DB_HOST
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: db_host
---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-svc
spec:
  type: ClusterIP            # 集群内部访问
  selector:
    app: my-app              # 匹配标签
  ports:
    - port: 80               # Service 端口
      targetPort: 8080       # Pod 端口
---
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  db_host: "postgres-svc"
  db_port: "5432"
```

```
Deployment + Service 的工作方式:

  外部请求
     │
     ▼
  ┌──────────────────────────────────────────────────┐
  │  Service: my-app-svc (ClusterIP: 10.96.0.100)   │
  │                                                  │
  │  负载均衡（轮询）                                  │
  │     ┌──────────┬──────────┬──────────┐           │
  │     ▼          ▼          ▼                      │
  │  ┌──────┐  ┌──────┐  ┌──────┐                   │
  │  │Pod 1 │  │Pod 2 │  │Pod 3 │  ← Deployment     │
  │  │:8080 │  │:8080 │  │:8080 │    管理 3 个副本   │
  │  └──────┘  └──────┘  └──────┘                   │
  │                                                  │
  │  Pod IP 会变（重启后新IP），但 Service IP 不变    │
  │  其他 Pod 通过 my-app-svc:80 访问                │
  └──────────────────────────────────────────────────┘

  滚动更新过程 (image: 1.0 → 2.0):

  ┌────────────────────────────────────────────────┐
  │  步骤1: 创建一个新 Pod (v2.0)                   │
  │  [v1] [v1] [v1] [v2 启动中...]                  │
  │                                                │
  │  步骤2: v2 就绪后，删除一个旧 Pod               │
  │  [v1] [v1] [v2 ✓]                              │
  │                                                │
  │  步骤3: 重复直到全部更新                         │
  │  [v2 ✓] [v2 ✓] [v2 ✓]                          │
  │                                                │
  │  全程不停机! 始终有 Pod 在服务                    │
  └────────────────────────────────────────────────┘
```

---

## 3. 完整部署 Go 应用示例

```bash
# 1. 构建镜像
docker build -t my-go-app:1.0 .

# 2. 应用 K8s 资源
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f configmap.yaml

# 3. 查看状态
kubectl get pods                    # 查看 Pod 列表
kubectl get svc                     # 查看 Service
kubectl describe pod my-app-xxx     # Pod 详情
kubectl logs -f my-app-xxx          # 查看日志

# 4. 扩缩容
kubectl scale deployment my-app --replicas=5

# 5. 更新镜像版本
kubectl set image deployment/my-app app=my-app:2.0

# 6. 回滚
kubectl rollout undo deployment/my-app
kubectl rollout history deployment/my-app
```

---

## 4. 小结

```
┌──────────────────────────────────────────────────────────────┐
│  Kubernetes 速查                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  核心资源:                                                    │
│  ├── Pod        → 最小调度单位（1~N 个容器）                 │
│  ├── Deployment → 管理无状态应用（副本、滚动更新）            │
│  ├── Service    → 服务发现 + 负载均衡                        │
│  ├── ConfigMap  → 配置（环境变量、配置文件）                  │
│  ├── Secret     → 敏感配置（密码、密钥）                     │
│  ├── Ingress    → HTTP 路由（域名→Service）                  │
│  └── HPA        → 自动水平扩缩容                             │
│                                                              │
│  架构:                                                        │
│  ├── Control Plane: API Server + Scheduler + Controller     │
│  └── Worker Node:   kubelet + kube-proxy + Pods             │
│                                                              │
│  核心理念: 声明式                                             │
│  你告诉 K8s "我要 3 个副本"                                  │
│  K8s 自己保证始终有 3 个在运行                                │
│  挂了自动拉起，多了自动删除                                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**模块九完成！**
