#!/usr/bin/env bash
# Sprint 82 — TTL-Policies fuer Karriaro-Webdesign Firestore.
#
# Aktiviert automatisches Loeschen von Daten nach Ablauf des `expiresAt`-Feldes.
# Ohne diese Policies bleibt der Code-Write `expiresAt: ...` wirkungslos —
# Daten bleiben dauerhaft gespeichert (DSGVO-Verstoss).
#
# Voraussetzung: `gcloud auth login` + Projekt `apex-executive` aktiv.
# Idempotent: kann mehrfach ausgefuehrt werden.

set -euo pipefail

PROJECT_ID="apex-executive"
DATABASE="(default)"

echo "Sprint-82 TTL-Setup fuer ${PROJECT_ID}..."

for collection in auditRequests auditAnalytics quickAudits rateLimitCounters; do
    echo "→ TTL ${collection}.expiresAt"
    # `gcloud firestore fields ttls update` setzt die Policy idempotent.
    gcloud firestore fields ttls update expiresAt \
        --collection-group="${collection}" \
        --enable-ttl \
        --project="${PROJECT_ID}" \
        --database="${DATABASE}" \
        --async \
        --quiet \
        || echo "  (bereits aktiv oder collection existiert noch nicht — wird beim ersten Write erzeugt)"
done

echo ""
echo "Fertig. TTL-Aktivierung kann bis zu 10 Minuten dauern, bevor sie greift."
echo "Status pruefen: gcloud firestore fields ttls list --project=${PROJECT_ID}"
