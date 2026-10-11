// SPDX-License-Identifier: Apache-2.0
// Runs every Dart example check: `dart pub get && dart run test/all_test.dart`.
import 'calculator_test.dart' show runCalculatorTests;
import 'core_capabilities_test.dart' show runCsvSafeTests, runIcsEventsTests, runMoneyTests, runSignedCursorsTests;
import 'form_schema_test.dart' show runFormSchemaTests;
import 'identifier_validator_test.dart' as identifier;
import 'marketing_test.dart' show runSeoFilesTests, runStructuredDataTests, runUtmLinksTests;
import 'oidc_pkce_test.dart' show runOidcPkceTests;
import 'recovery_codes_test.dart' show runRecoveryCodesTests;
import 'src/checks.dart';
import 'totp_test.dart' show runTotpTests;
import 'wave4_test.dart'
    show runCronNextTests, runGeoTests, runIdsTests, runRetryBackoffTests, runSemverTests, runTokenBucketTests, runWcagContrastTests, runWebhookSignatureTests;
import 'wave5_test.dart'
    show
        runCheckDigitsTests,
        runEmailAddressTests,
        runGeometryTests,
        runIsoDurationTests,
        runPolylineTests,
        runSafeRedirectTests,
        runSignedUrlsTests,
        runTileMathTests;
import 'wave6_test.dart'
    show
        runContentNegotiationTests,
        runCookiesTests,
        runHttpConditionalTests,
        runHttpRangeTests,
        runIpCidrTests,
        runRRuleTests,
        runStringSimilarityTests,
        runUrlNormalizeTests;
import 'wave7_test.dart'
    show
        runBaseEncodingsTests,
        runFeatureFlagsTests,
        runHashingTests,
        runHumanUnitsTests,
        runPasswordPolicyTests,
        runTextSanitizeTests,
        runVCardTests;
import 'wave8_test.dart' show runJsonPatchTests, runLineDiffTests, runSlugifyTests;
import 'wave9_test.dart'
    show
        runBusinessDaysTests,
        runCircuitBreakerTests,
        runColorConvertTests,
        runFileSignatureTests,
        runNaturalSortTests,
        runSseTests,
        runTextChunkingTests,
        runVectorMathTests;
import 'wave10_test.dart'
    show
        runCacheControlTests,
        runContentDispositionTests,
        runDataUriTests,
        runDotenvTests,
        runGlobMatchTests,
        runIsoWeekTests,
        runLinkHeaderTests,
        runMimeTypesTests,
        runQueryStringTests,
        runTopoSortTests;
import 'wave11_test.dart'
    show
        runBase58Tests,
        runDottedPathTests,
        runHtmlEscapeTests,
        runIniParseTests,
        runPasswordGenerateTests,
        runPiiMaskTests,
        runPunycodeTests,
        runRomanNumeralsTests,
        runTemplateRenderTests;

void main() {
  identifier.main(); // throws on failure (existing check)
  final c = Checks('all')..check('identifier validator', true);
  runTotpTests(c);
  runOidcPkceTests(c);
  runRecoveryCodesTests(c);
  runCalculatorTests(c);
  runFormSchemaTests(c);
  runSeoFilesTests(c);
  runStructuredDataTests(c);
  runUtmLinksTests(c);
  runCsvSafeTests(c);
  runMoneyTests(c);
  runSignedCursorsTests(c);
  runIcsEventsTests(c);
  runIdsTests(c);
  runRetryBackoffTests(c);
  runTokenBucketTests(c);
  runSemverTests(c);
  runCronNextTests(c);
  runWcagContrastTests(c);
  runGeoTests(c);
  runWebhookSignatureTests(c);
  runCheckDigitsTests(c);
  runSignedUrlsTests(c);
  runPolylineTests(c);
  runTileMathTests(c);
  runEmailAddressTests(c);
  runIsoDurationTests(c);
  runGeometryTests(c);
  runSafeRedirectTests(c);
  runIpCidrTests(c);
  runHttpRangeTests(c);
  runContentNegotiationTests(c);
  runHttpConditionalTests(c);
  runCookiesTests(c);
  runUrlNormalizeTests(c);
  runStringSimilarityTests(c);
  runRRuleTests(c);
  runBaseEncodingsTests(c);
  runVCardTests(c);
  runHashingTests(c);
  runFeatureFlagsTests(c);
  runHumanUnitsTests(c);
  runLineDiffTests(c);
  runPasswordPolicyTests(c);
  runTextSanitizeTests(c);
  runSlugifyTests(c);
  runJsonPatchTests(c);
  runSseTests(c);
  runTextChunkingTests(c);
  runVectorMathTests(c);
  runCircuitBreakerTests(c);
  runBusinessDaysTests(c);
  runNaturalSortTests(c);
  runFileSignatureTests(c);
  runColorConvertTests(c);
  runGlobMatchTests(c);
  runDotenvTests(c);
  runQueryStringTests(c);
  runMimeTypesTests(c);
  runDataUriTests(c);
  runIsoWeekTests(c);
  runTopoSortTests(c);
  runLinkHeaderTests(c);
  runContentDispositionTests(c);
  runCacheControlTests(c);
  runPunycodeTests(c);
  runBase58Tests(c);
  runRomanNumeralsTests(c);
  runDottedPathTests(c);
  runTemplateRenderTests(c);
  runIniParseTests(c);
  runPiiMaskTests(c);
  runPasswordGenerateTests(c);
  runHtmlEscapeTests(c);
  c.finish();
}
