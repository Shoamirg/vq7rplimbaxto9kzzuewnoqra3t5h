import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

// The host adapter avoids Flutter test's DDS-dependent golden proxy. Evidence
// contains synthetic screenshots and outcome metadata, never fixture logins.
Future<void> main() async {
  final destination = Directory('../../ci-evidence/android-mvp/native-screens');
  await destination.create(recursive: true);
  await integrationDriver(
    onScreenshot: (name, bytes, [args]) async {
      if (!RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(name)) return false;
      await File('${destination.path}/$name.png').writeAsBytes(bytes);
      return bytes.isNotEmpty;
    },
    responseDataCallback: (data) async {
      await File('${destination.path}/driver-result.json').writeAsString(
        jsonEncode({
          'screenshots': (data?['screenshots'] as List?)?.length ?? 0,
          'completed_at': DateTime.now().toUtc().toIso8601String(),
        }),
      );
    },
    writeResponseOnFailure: true,
  );
}
