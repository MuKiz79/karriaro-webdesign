#!/usr/bin/env bash
# Sprint 82 — GCS-Backup fuer Firestore (Disaster-Recovery).
#
# Legt einen GCS-Bucket an und richtet einen Cloud-Scheduler ein, der
# Firestore taeglich 03:00 UTC exportiert. Lifecycle-Rule loescht
# Backups nach 30 Tagen.
#
# Voraussetzung: gcloud auth + Projekt apex-executive aktiv, Roles:
# - Cloud Scheduler Admin
# - Firestore Owner
# - Storage Admin

set -euo pipefail

PROJECT_ID="apex-executive"
BUCKET="${PROJECT_ID}-firestore-backups"
LOCATION="europe-west1"
SERVICE_ACCOUNT="${PROJECT_ID}@appspot.gserviceaccount.com"

echo "Sprint-82 GCS-Backup-Setup fuer ${PROJECT_ID}..."

# 1) Bucket anlegen (idempotent — Existenz-Check)
if ! gsutil ls -b "gs://${BUCKET}" >/dev/null 2>&1; then
    echo "→ Bucket gs://${BUCKET} anlegen"
    gsutil mb -p "${PROJECT_ID}" -l "${LOCATION}" -c STANDARD "gs://${BUCKET}"
else
    echo "→ Bucket gs://${BUCKET} existiert bereits"
fi

# 2) Lifecycle-Rule: nach 30 Tagen loeschen
echo "→ Lifecycle: 30-Tage-Retention"
cat > /tmp/lifecycle.json <<'JSON'
{
  "lifecycle": {
    "rule": [
      { "action": { "type": "Delete" }, "condition": { "age": 30 } }
    ]
  }
}
JSON
gsutil lifecycle set /tmp/lifecycle.json "gs://${BUCKET}"
rm -f /tmp/lifecycle.json

# 3) Service-Account-Permissions
echo "→ Service-Account-Permissions"
gsutil iam ch "serviceAccount:${SERVICE_ACCOUNT}:objectAdmin" "gs://${BUCKET}"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/datastore.importExportAdmin" \
    --condition=None \
    --quiet >/dev/null

# 4) Cloud-Scheduler: taeglich 03:00 UTC
JOB_NAME="firestore-daily-backup"
echo "→ Cloud-Scheduler ${JOB_NAME}"
if gcloud scheduler jobs describe "${JOB_NAME}" --location="${LOCATION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "  (Job existiert bereits — Update mit aktueller Konfiguration)"
    gcloud scheduler jobs update http "${JOB_NAME}" \
        --location="${LOCATION}" \
        --schedule="0 3 * * *" \
        --time-zone="UTC" \
        --uri="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default):exportDocuments" \
        --http-method=POST \
        --oauth-service-account-email="${SERVICE_ACCOUNT}" \
        --message-body="{\"outputUriPrefix\":\"gs://${BUCKET}/\$(date +%Y%m%d)\"}" \
        --project="${PROJECT_ID}" \
        --quiet
else
    gcloud scheduler jobs create http "${JOB_NAME}" \
        --location="${LOCATION}" \
        --schedule="0 3 * * *" \
        --time-zone="UTC" \
        --uri="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default):exportDocuments" \
        --http-method=POST \
        --oauth-service-account-email="${SERVICE_ACCOUNT}" \
        --message-body="{\"outputUriPrefix\":\"gs://${BUCKET}/\$(date +%Y%m%d)\"}" \
        --project="${PROJECT_ID}" \
        --quiet
fi

echo ""
echo "Fertig. Backup laeuft taeglich 03:00 UTC, Retention 30 Tage."
echo "Manueller Trigger: gcloud scheduler jobs run ${JOB_NAME} --location=${LOCATION} --project=${PROJECT_ID}"
echo "Backups auflisten: gsutil ls gs://${BUCKET}"
