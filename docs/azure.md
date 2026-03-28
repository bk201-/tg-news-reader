# TG News Reader — Azure Operations

> Операционный справочник по Azure Container Apps. Обновляется при изменении конфигурации.  
> Ресурсы: подписка `f7758f68-5127-4e40-b8bf-3bd367b448a9`, ресурс-группа `personal-apps-rg`, приложение `tg-news-reader`.

---

## Текущая конфигурация Container App

| Параметр | Значение | Обновлено |
|---|---|---|
| `minReplicas` | 0 (scale-to-zero) | — |
| `maxReplicas` | 10 | — |
| `cooldownPeriod` | **1800 сек (30 мин)** | 28.03.2026 |
| `pollingInterval` | 30 сек | — |

---

## Переменные окружения

> ⚠️ **`az containerapp update --set-env-vars` заменяет ВЕСЬ список переменных, а не добавляет к нему.**  
> Безопасный способ: **Azure Portal** → Container App → Configuration → Environment variables → добавить отдельные переменные.  
> Если через CLI — передавать полный список сразу (см. ниже).

### Обязательные (прод упадёт без них)

```
NODE_ENV=production
ALLOWED_ORIGIN=https://tg-news-reader.graycoast-407e8a98.westeurope.azurecontainerapps.io
TG_API_ID          → secretref:tg-api-id
TG_API_HASH        → secretref:tg-api-hash
TG_SESSION         → secretref:tg-session
DATABASE_URL       → secretref:database-url
TURSO_AUTH_TOKEN   → secretref:turso-auth-token
JWT_SECRET         → secretref:jwt-secret
```

### Опциональные (no-op при отсутствии)

```
ALERT_BOT_TOKEN    → secretref:alert-bot-token
ALERT_CHAT_ID      → secretref:alert-chat-id
AZURE_OPENAI_ENDPOINT → secretref:azure-openai-endpoint
AZURE_OPENAI_KEY   → secretref:azure-openai-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
OPENAI_API_KEY     → secretref:openai-api-key
LOG_LEVEL=info
```

### Полный CLI-список (использовать осторожно)

```bash
az containerapp update --name tg-news-reader --resource-group personal-apps-rg \
  --set-env-vars \
    NODE_ENV=production \
    ALLOWED_ORIGIN=https://tg-news-reader.graycoast-407e8a98.westeurope.azurecontainerapps.io \
    TG_API_ID=secretref:tg-api-id \
    TG_API_HASH=secretref:tg-api-hash \
    TG_SESSION=secretref:tg-session \
    DATABASE_URL=secretref:database-url \
    TURSO_AUTH_TOKEN=secretref:turso-auth-token \
    JWT_SECRET=secretref:jwt-secret \
    ALERT_BOT_TOKEN=secretref:alert-bot-token \
    ALERT_CHAT_ID=secretref:alert-chat-id \
    AZURE_OPENAI_ENDPOINT=secretref:azure-openai-endpoint \
    AZURE_OPENAI_KEY=secretref:azure-openai-key \
    AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini \
    OPENAI_API_KEY=secretref:openai-api-key \
    LOG_LEVEL=info
```

---

## Управление секретами

```bash
# Добавить новый секрет
az containerapp secret set \
  --name tg-news-reader \
  --resource-group personal-apps-rg \
  --secrets my-secret-name=<value>

# Затем в Portal: добавить env var MY_VAR = secretref:my-secret-name
```

---

## Scale-down cooldown

```bash
# Посмотреть текущий конфиг scale
az containerapp show \
  --name tg-news-reader \
  --resource-group personal-apps-rg \
  --query "properties.template.scale"

# Изменить cooldownPeriod (нужен preview API — stable его не принимает как writable)
az rest --method PATCH \
  --url "https://management.azure.com/subscriptions/f7758f68-5127-4e40-b8bf-3bd367b448a9/resourceGroups/personal-apps-rg/providers/Microsoft.App/containerApps/tg-news-reader?api-version=2024-10-02-preview" \
  --body '{"properties":{"template":{"scale":{"cooldownPeriod":1800,"maxReplicas":10,"minReplicas":null,"pollingInterval":30}}}}'
```

---

## Azure Monitor Alerts

Задеплоены в `personal-apps-rg`. Action Group: `tg-reader-alerts` → email `sceletron@gmail.com`.

| Правило | Метрика / KQL | Порог | Окно | Обновлено |
|---|---|---|---|---|
| `tg-reader-restart` | `RestartCount` | **> 1** | **15 мин** | 28.03.2026 |
| `tg-reader-error-logs` | KQL: `log.level >= 50` | > 0 | 5 мин | — |

### Изменить правило алерта

```bash
# PATCH через REST API (2018-03-01)
az rest --method PATCH \
  --url "https://management.azure.com/subscriptions/f7758f68-5127-4e40-b8bf-3bd367b448a9/resourceGroups/personal-apps-rg/providers/Microsoft.Insights/metricAlerts/tg-reader-restart?api-version=2018-03-01" \
  --body @alert-patch.json
```

Пересоздать всё с нуля: `scripts/setup-monitoring.sh`.  
Референс тела KQL-правила: `C:\Users\dshilov\alert-kql-rule.json`.

---

## Полезные команды

```bash
# Логи (последние 50 строк системных событий)
az containerapp logs show \
  --name tg-news-reader \
  --resource-group personal-apps-rg \
  --type system --tail 50

# Статус ревизий
az containerapp revision list \
  --name tg-news-reader \
  --resource-group personal-apps-rg \
  --output table

# Health check
curl https://tg-news-reader.graycoast-407e8a98.westeurope.azurecontainerapps.io/api/health
```

---

## GitHub Actions secrets

| Secret | Назначение |
|---|---|
| `ACR_LOGIN_SERVER` | Azure Container Registry URL |
| `ACR_USERNAME` / `ACR_PASSWORD` | ACR credentials |
| `AZURE_CREDENTIALS` | Service principal JSON для az login |
| `AZURE_RESOURCE_GROUP` | `personal-apps-rg` |
| `AZURE_CONTAINER_APP` | `tg-news-reader` |
| `PAT_TOKEN` | Fine-grained PAT (Contents+PRs write) — для auto-merge |
| `ALERT_BOT_TOKEN` / `ALERT_CHAT_ID` | Telegram deploy-failure alerts (опционально) |

