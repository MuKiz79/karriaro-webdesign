/**
 * Lädt die PRODUKTIVEN src/-Module — nach Installation des localStorage-Stubs,
 * per dynamic import (kein ESM-Hoisting-Risiko). Die Probe misst die App,
 * deshalb hier ausschließlich Produktiv-Code, keine Kopien.
 */
import { installLocalStorageStub } from './stubs.mjs';
installLocalStorageStub();

const [
    opportunity, buyingIntent, websiteScore, techDetect, googleAds, jobSignal,
    footprintMod, techAgeMod, triggerEvents, peerPressure, claimVerify, scanCache,
    enterpriseDb, concurrency
] = await Promise.all([
    import('../../src/scoring/opportunity.js'),
    import('../../src/analysis/buying-intent.js'),
    import('../../src/signals/website-score.js'),
    import('../../src/signals/tech-detect.js'),
    import('../../src/signals/google-ads.js'),
    import('../../src/signals/job-signal.js'),
    import('../../src/signals/digital-footprint.js'),
    import('../../src/analysis/tech-age.js'),
    import('../../src/analysis/trigger-events.js'),
    import('../../src/analysis/peer-pressure.js'),
    import('../../src/analysis/claim-verify.js'),
    import('../../src/api/scan-cache.js'),
    import('../../src/priors/enterprise-db.js'),
    import('../../src/lib/concurrency.js')
]);

export const computeOpportunity = opportunity.computeOpportunity;
export const assessBuyingIntent = buyingIntent.assessBuyingIntent;
export const extractWebsiteScore = websiteScore.extractWebsiteScore;
export const detectTech = techDetect.detectTech;
export const detectGoogleAds = googleAds.detectGoogleAds;
export const detectJobSignals = jobSignal.detectJobSignals;
export const analyzeDigitalFootprint = footprintMod.analyzeDigitalFootprint;
export const analyzeTechAge = techAgeMod.analyzeTechAge;
export const seasonalTriggerFor = triggerEvents.seasonalTriggerFor;
export const computePeerPressure = peerPressure.computePeerPressure;
export const siteLooksModern = claimVerify.siteLooksModern;
export const deriveReviewRecency = scanCache.deriveReviewRecency;
export const checkEnterpriseDB = enterpriseDb.checkEnterpriseDB;
export const runWithConcurrency = concurrency.runWithConcurrency;
