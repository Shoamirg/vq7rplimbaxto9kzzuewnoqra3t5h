import 'dart:convert';
import 'dart:io';

// gen-l10n otherwise falls back to the template for missing translations.
void main() {
  final catalogs = <String, Map<String, dynamic>>{
    for (final code in ['uz', 'en', 'ru'])
      code: jsonDecode(
        File('lib/l10n/app_$code.arb').readAsStringSync(),
      ) as Map<String, dynamic>,
  };
  final expected = catalogs['uz']!.keys
      .where((key) => !key.startsWith('@'))
      .toSet();
  final problems = <String>[];
  for (final entry in catalogs.entries) {
    final keys = entry.value.keys.where((key) => !key.startsWith('@')).toSet();
    for (final key in expected.difference(keys)) {
      problems.add('${entry.key}: missing $key');
    }
    for (final key in keys.difference(expected)) {
      problems.add('${entry.key}: unknown $key');
    }
    for (final key in keys) {
      final value = entry.value[key];
      if (value is! String || value.trim().isEmpty) {
        problems.add('${entry.key}: empty or invalid $key');
      }
    }
  }
  if (problems.isNotEmpty) {
    stderr.writeln(problems.join('\n'));
    exitCode = 1;
    return;
  }
  stdout.writeln(
    'UZ/EN/RU: ${expected.length} complete messages per language.',
  );
}
