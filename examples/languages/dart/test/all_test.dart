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
  c.finish();
}
