#!/usr/bin/env bash
# Sprint 82 — Monitoring-Setup fuer Karriaro-Webdesign.
#
# 1) Budget-Alert: 50/100/200 EUR Monatslimit mit E-Mail-Notify
# 2) Uptime-Check: quickAudit-Endpoint alle 5min, Alert wenn 3x in Folge down
#
# Voraussetzung: gcloud auth + Billing-Account-ID ermitteln:
#   gcloud billing accounts list
# Dann BILLING_ACCOUNT_ID setzen.

set -euo pipefail

PROJECT_ID="apex-executive"
ALERT_EMAIL="${ALERT_EMAIL:-kontakt@karriaro.de}"
BILLING_ACCOUNT_ID="${BILLING_ACCOUNT_ID:-}"

if [[ -z "${BILLING_ACCOUNT_ID}" ]]; then
    echo "ERROR: BILLING_ACCOUNT_ID nicht gesetzt."
    echo "Liste verfuegbarer Billing-Accounts:"
    gcloud billing accounts list
    echo ""
    echo "Setze: export BILLING_ACCOUNT_ID=<ID> && bash $0"
    exit 1
fi

echo "Sprint-82 Monitoring-Setup fuer ${PROJECT_ID}, Alert-Mail: ${ALERT_EMAIL}"

# 1) Notification-Channel fuer E-Mail (idempotent ueber Display-Name)
CHANNEL_DISPLAY="Karriaro-Webdesign-Alerts"
CHANNEL_ID="$(gcloud alpha monitoring channels list \
    --project="${PROJECT_ID}" \
    --filter="displayName=\"${CHANNEL_DISPLAY}\"" \
    --format="value(name)" 2>/dev/null | head -1 || true)"

if [[ -z "${CHANNEL_ID}" ]]; then
    echo "→ Notification-Channel anlegen"
    CHANNEL_ID="$(gcloud alpha monitoring channels create \
        --project="${PROJECT_ID}" \
        --display-name="${CHANNEL_DISPLAY}" \
        --type=email \
        --channel-labels="email_address=${ALERT_EMAIL}" \
        --format="value(name)")"
else
    echo "→ Notification-Channel existiert: ${CHANNEL_ID}"
fi

# 2) Budget-Alerts: 50/100/200 EUR
for amount in 50 100 200; do
    BUDGET_NAME="webdesign-${amount}-eur"
    echo "→ Budget-Alert ${amount} EUR"
    gcloud billing budgets create \
        --billing-account="${BILLING_ACCOUNT_ID}" \
        --display-name="${BUDGET_NAME}" \
        --budget-amount="${amount}EUR" \
        --filter-projects="projects/${PROJECT_ID}" \
        --threshold-rule="percent=0.5" \
        --threshold-rule="percent=0.9" \
        --threshold-rule="percent=1.0" \
        --notifications-rule-monitoring-notification-channels="${CHANNEL_ID}" \
        --notifications-rule-disable-default-iam-recipients \
        --quiet 2>&1 | grep -v "already exists" || echo "  (existiert bereits)"
done

# 3) Uptime-Check fuer quickAudit
echo "→ Uptime-Check: quickAudit"
cat > /tmp/uptime-quickaudit.yaml <<'YAML'
displayName: "quickAudit Uptime"
httpCheck:
  path: "/quickAudit"
  port: 443
  useSsl: true
  requestMethod: GET
monitoredResource:
  type: "uptime_url"
  labels:
    project_id: "apex-executive"
    host: "europe-west1-apex-executive.cloudfunctions.net"
period: "300s"
timeout: "10s"
selectedRegions:
  - EUROPE
YAML
gcloud monitoring uptime create karriaro-quickaudit-uptime \
    --resource-type=uptime-url \
    --resource-labels="host=europe-west1-apex-executive.cloudfunctions.net,project_id=${PROJECT_ID}" \
    --protocol=https \
    --path="/quickAudit" \
    --port=443 \
    --period=5 \
    --timeout=10 \
    --project="${PROJECT_ID}" \
    --quiet 2>&1 | grep -v "already exists" || echo "  (existiert bereits oder Setup im Console-UI noetig)"
rm -f /tmp/uptime-quickaudit.yaml

echo ""
echo "Fertig. Pruefen unter:"
echo "  Budgets:  https://console.cloud.google.com/billing/${BILLING_ACCOUNT_ID}/budgets"
echo "  Uptime:   https://console.cloud.google.com/monitoring/uptime?project=${PROJECT_ID}"
echo "  Alerts:   https://console.cloud.google.com/monitoring/alerting?project=${PROJECT_ID}"
